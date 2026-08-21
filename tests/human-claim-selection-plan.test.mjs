import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildClaimReviewMaterialPreview } from "../bridge/claim-review-material-preview.mjs";
import { buildHumanClaimSelectionPlan, HUMAN_CLAIM_SELECTION_CHECKS } from "../bridge/human-claim-selection-plan.mjs";
import { buildTextDraftBriefPreview } from "../bridge/text-draft-brief-preview.mjs";

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function materialPreview() {
  const brief = buildTextDraftBriefPreview({
    status: "source_lock_read_ready",
    found: true,
    readFingerprint: "a".repeat(64),
    record: {
      id: "lock-one",
      leadId: "lead-one",
      title: "Synthetic technology topic",
      status: "active",
      savePlanFingerprint: "b".repeat(64),
      reviewFingerprint: "c".repeat(64),
      evidence: [
        { evidenceId: "original-one", sourceId: "official-source", sourceName: "Official", title: "Synthetic release", canonicalUrl: "https://official.example/release", publishedAt: "2026-08-20T12:00:00.000Z", evidenceRole: "original" },
        { evidenceId: "independent-one", sourceId: "independent-source", sourceName: "Independent", title: "Synthetic report", canonicalUrl: "https://independent.example/report", publishedAt: "2026-08-20T14:00:00.000Z", evidenceRole: "independent" },
      ],
    },
  }, { editorialAngle: "人工核对这项虚构技术变化的范围" });
  const documents = [
    { evidenceId: "original-one", sourceId: "official-source", evidenceRole: "original", canonicalUrl: "https://official.example/release", text: "The synthetic official source says a fictional test will begin in three regions next month. Every detail in this sentence requires a human editor to check the stated scope and date.", ephemeral: true },
    { evidenceId: "independent-one", sourceId: "independent-source", evidenceRole: "independent", canonicalUrl: "https://independent.example/report", text: "The synthetic independent source separately describes a fictional three-region test next month. This fixture does not verify the event and exists only to exercise the human review boundary.", ephemeral: true },
  ].map((document) => ({ ...document, textHash: hash(document.text) }));
  return buildClaimReviewMaterialPreview({ status: "public_article_acquisition_complete", sourceBodiesFetched: true, documents }, brief);
}

function decision(material = materialPreview(), overrides = {}) {
  return {
    decisionId: "claim-one",
    proposedClaim: "两条模拟来源都提到一项将在下月覆盖三个地区的测试，但仍须人工确认。",
    supportingCandidateIds: material.sourceMaterials.map((source) => source.candidates[0].candidateId),
    checks: Object.fromEntries(HUMAN_CLAIM_SELECTION_CHECKS.map((check) => [check, true])),
    ...overrides,
  };
}

test("builds a fingerprinted two-source human claim selection plan", () => {
  const material = materialPreview();
  const plan = buildHumanClaimSelectionPlan(material, [decision(material)], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });

  assert.equal(plan.status, "human_claim_selection_plan_ready");
  assert.equal(plan.plannedClaimCount, 1);
  assert.match(plan.claimSelectionFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(plan.plannedClaims[0].sources.map((source) => source.evidenceRole), ["original", "independent"]);
  assert.equal(plan.plannedClaims[0].status, "human_claim_selection_planned_not_accepted");
});

test("blocks missing confirmation, stale candidates, one-source support and incomplete checks", () => {
  const material = materialPreview();
  const current = decision(material);
  const noConfirmation = buildHumanClaimSelectionPlan(material, [current]);
  const stale = buildHumanClaimSelectionPlan(material, [{ ...current, supportingCandidateIds: [current.supportingCandidateIds[0], "0".repeat(64)] }], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });
  const sameSource = buildHumanClaimSelectionPlan(material, [{ ...current, supportingCandidateIds: material.sourceMaterials[0].candidates.slice(0, 2).map((candidate) => candidate.candidateId) }], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });
  const incomplete = buildHumanClaimSelectionPlan(material, [{ ...current, checks: { ...current.checks, numbers_and_dates_checked: false } }], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });

  assert.ok(noConfirmation.blockers.includes("claim_review_material_confirmation_required"));
  assert.ok(stale.blockers.includes("claim-one:supporting_candidate_not_current"));
  assert.ok(sameSource.blockers.includes("claim-one:both_source_roles_required"));
  assert.ok(incomplete.blockers.includes("claim-one:human_check_missing:numbers_and_dates_checked"));
});

test("detects material tampering and changes fingerprint with human claim wording", () => {
  const material = materialPreview();
  const current = decision(material);
  const first = buildHumanClaimSelectionPlan(material, [current], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });
  const changed = buildHumanClaimSelectionPlan(material, [{ ...current, proposedClaim: "两条模拟来源提到一项虚构测试，但其范围和日期仍须再次人工确认。" }], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });
  const tampered = structuredClone(material);
  tampered.sourceMaterials[0].candidates[0].text += " tampered";
  const blocked = buildHumanClaimSelectionPlan(tampered, [current], { confirmedMaterialFingerprint: tampered.candidateMaterialFingerprint });

  assert.notEqual(first.claimSelectionFingerprint, changed.claimSelectionFingerprint);
  assert.ok(blocked.blockers.includes("claim_review_material_tampered"));
});

test("keeps claim acceptance, facts, drafts and routes closed", async () => {
  const material = materialPreview();
  const plan = buildHumanClaimSelectionPlan(material, [decision(material)], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });
  assert.equal(plan.claimAcceptanceRequired, true);
  assert.equal(plan.claimAcceptanceGranted, false);
  assert.equal(plan.claimsAccepted, 0);
  assert.equal(plan.factsVerified, false);
  assert.equal(plan.readyForCopyGeneration, false);
  assert.equal(plan.draftGenerated, false);
  assert.equal(plan.databaseWrites, false);
  assert.equal(plan.externalCalls, 0);
  assert.equal(plan.publishTriggered, false);

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("human-claim-selection-plan")));
});
