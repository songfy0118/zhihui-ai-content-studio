import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildClaimReviewMaterialPreview } from "../bridge/claim-review-material-preview.mjs";
import { HUMAN_CLAIM_ACCEPTANCE_CHECKS, HUMAN_CLAIM_ACCEPTANCE_CONFIRMATION, buildHumanClaimAcceptancePreview } from "../bridge/human-claim-acceptance-preview.mjs";
import { HUMAN_CLAIM_SELECTION_CHECKS, buildHumanClaimSelectionPlan } from "../bridge/human-claim-selection-plan.mjs";
import { buildTextDraftBriefPreview } from "../bridge/text-draft-brief-preview.mjs";

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function selectionPlan() {
  const brief = buildTextDraftBriefPreview({
    status: "source_lock_read_ready",
    found: true,
    readFingerprint: "a".repeat(64),
    record: {
      id: "lock-one",
      leadId: "lead-one",
      title: "Synthetic topic",
      status: "active",
      savePlanFingerprint: "b".repeat(64),
      reviewFingerprint: "c".repeat(64),
      evidence: [
        { evidenceId: "original-one", sourceId: "official-source", sourceName: "Official", title: "Synthetic release", canonicalUrl: "https://official.example/release", publishedAt: "2026-08-20T12:00:00.000Z", evidenceRole: "original" },
        { evidenceId: "independent-one", sourceId: "independent-source", sourceName: "Independent", title: "Synthetic report", canonicalUrl: "https://independent.example/report", publishedAt: "2026-08-20T14:00:00.000Z", evidenceRole: "independent" },
      ],
    },
  }, { editorialAngle: "人工确认模拟事件的范围与时间" });
  const documents = [
    { evidenceId: "original-one", sourceId: "official-source", evidenceRole: "original", canonicalUrl: "https://official.example/release", text: "The synthetic official source describes a fictional test planned for three regions next month. This is fixture text and every scope, date and number still needs human review.", ephemeral: true },
    { evidenceId: "independent-one", sourceId: "independent-source", evidenceRole: "independent", canonicalUrl: "https://independent.example/report", text: "The synthetic independent source also mentions a fictional three-region test next month. It is not proof and remains unverified fixture material for this acceptance boundary test.", ephemeral: true },
  ].map((document) => ({ ...document, textHash: hash(document.text) }));
  const material = buildClaimReviewMaterialPreview({ status: "public_article_acquisition_complete", sourceBodiesFetched: true, documents }, brief);
  const selectionChecks = Object.fromEntries(HUMAN_CLAIM_SELECTION_CHECKS.map((check) => [check, true]));
  return buildHumanClaimSelectionPlan(material, [{
    decisionId: "claim-one",
    proposedClaim: "两条模拟来源都提到下月覆盖三个地区的虚构测试，但其真实性仍未确认。",
    supportingCandidateIds: material.sourceMaterials.map((source) => source.candidates[0].candidateId),
    checks: selectionChecks,
  }], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });
}

function acceptanceDecision(plan = selectionPlan(), overrides = {}) {
  return {
    claimId: plan.plannedClaims[0].claimId,
    accept: true,
    reviewNote: "仅接受当前谨慎措辞，发布前仍需保留事件真实性尚未确认的说明。",
    checks: Object.fromEntries(HUMAN_CLAIM_ACCEPTANCE_CHECKS.map((check) => [check, true])),
    ...overrides,
  };
}

function requestOptions(plan) {
  return {
    confirmedClaimSelectionFingerprint: plan.claimSelectionFingerprint,
    confirmation: HUMAN_CLAIM_ACCEPTANCE_CONFIRMATION,
  };
}

test("builds a deterministic non-persisted human acceptance receipt preview", () => {
  const plan = selectionPlan();
  const first = buildHumanClaimAcceptancePreview(plan, [acceptanceDecision(plan)], requestOptions(plan));
  const repeat = buildHumanClaimAcceptancePreview(plan, [acceptanceDecision(plan)], requestOptions(plan));

  assert.equal(first.status, "human_claim_acceptance_preview_ready");
  assert.equal(first.acceptedClaimCountInPreview, 1);
  assert.match(first.acceptanceFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(first.acceptanceFingerprint, repeat.acceptanceFingerprint);
  assert.equal(first.receiptPreview.status, "preview_not_persisted");
  assert.match(first.idempotencyKey, /^human-claim-acceptance:[a-f0-9]{64}$/);
});

test("blocks missing confirmation, explicit rejection and incomplete human checks", () => {
  const plan = selectionPlan();
  const decision = acceptanceDecision(plan);
  const missing = buildHumanClaimAcceptancePreview(plan, [decision]);
  const rejected = buildHumanClaimAcceptancePreview(plan, [{ ...decision, accept: false }], requestOptions(plan));
  const incomplete = buildHumanClaimAcceptancePreview(plan, [{ ...decision, checks: { ...decision.checks, uncertainty_note_approved: false } }], requestOptions(plan));

  assert.ok(missing.blockers.includes("claim_selection_confirmation_required"));
  assert.ok(missing.blockers.includes("claim_acceptance_confirmation_invalid"));
  assert.ok(rejected.blockers.includes(`${decision.claimId}:explicit_claim_acceptance_required`));
  assert.ok(incomplete.blockers.includes(`${decision.claimId}:human_check_missing:uncertainty_note_approved`));
});

test("detects a tampered plan and binds changed review notes to a new fingerprint", () => {
  const plan = selectionPlan();
  const decision = acceptanceDecision(plan);
  const first = buildHumanClaimAcceptancePreview(plan, [decision], requestOptions(plan));
  const changed = buildHumanClaimAcceptancePreview(plan, [{ ...decision, reviewNote: "接受当前模拟措辞，但必须在成稿中继续声明事件、数字和日期均未完成真实核验。" }], requestOptions(plan));
  const tampered = structuredClone(plan);
  tampered.plannedClaims[0].proposedClaim += "篡改";
  const blocked = buildHumanClaimAcceptancePreview(tampered, [decision], requestOptions(tampered));

  assert.notEqual(first.acceptanceFingerprint, changed.acceptanceFingerprint);
  assert.ok(blocked.blockers.includes("claim_selection_plan_tampered"));
});

test("does not persist acceptance, verify facts, unlock copy or connect routes", async () => {
  const plan = selectionPlan();
  const preview = buildHumanClaimAcceptancePreview(plan, [acceptanceDecision(plan)], requestOptions(plan));
  assert.equal(preview.persistenceAuthorizationRequired, true);
  assert.equal(preview.persistenceAuthorizationGranted, false);
  assert.equal(preview.persisted, false);
  assert.equal(preview.claimsAccepted, 0);
  assert.equal(preview.factsVerified, false);
  assert.equal(preview.readyForCopyGeneration, false);
  assert.equal(preview.draftGenerated, false);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.externalCalls, 0);
  assert.equal(preview.publishTriggered, false);

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("human-claim-acceptance-preview")));
});
