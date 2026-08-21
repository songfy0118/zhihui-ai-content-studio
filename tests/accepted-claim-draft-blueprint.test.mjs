import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { HUMAN_CLAIM_ACCEPTANCE_CHECKS } from "../bridge/human-claim-acceptance-preview.mjs";
import { buildAcceptedClaimDraftBlueprint } from "../bridge/accepted-claim-draft-blueprint.mjs";

const acceptanceRead = {
  status: "human_claim_acceptance_read_ready",
  found: true,
  durableHumanAcceptance: true,
  draftResearchInputReady: true,
  readFingerprint: "a".repeat(64),
  receipt: {
    receiptId: `hcap_${"b".repeat(64)}`,
    claimSelectionFingerprint: "c".repeat(64),
    acceptanceFingerprint: "b".repeat(64),
    status: "active",
    claims: [{
      claimId: "d".repeat(64),
      proposedClaim: "两条模拟来源均描述同一个虚构测试，但不代表真实新闻。",
      reviewNote: "人工接受谨慎措辞，并要求保留真实性尚未确认的说明。",
      status: "human_accepted_persisted",
      acceptanceChecks: Object.fromEntries(HUMAN_CLAIM_ACCEPTANCE_CHECKS.map((check) => [check, true])),
      sources: [
        { candidateId: "e".repeat(64), evidenceId: "original-one", sourceId: "official-source", evidenceRole: "original", canonicalUrl: "https://official.example/release", sourceSentence: "模拟官方来源描述虚构测试。" },
        { candidateId: "f".repeat(64), evidenceId: "independent-one", sourceId: "independent-source", evidenceRole: "independent", canonicalUrl: "https://independent.example/report", sourceSentence: "模拟独立来源描述同一虚构测试。" },
      ],
    }],
  },
};

const angle = "这个虚构测试为何需要双来源确认？";

test("builds a deterministic two-platform structure from durable accepted claims", () => {
  const result = buildAcceptedClaimDraftBlueprint(acceptanceRead, { editorialAngle: angle });

  assert.equal(result.status, "accepted_claim_draft_blueprint_ready");
  assert.equal(result.readyForHumanCopyDrafting, true);
  assert.match(result.blueprintFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.targetPlatforms, ["xiaohongshu", "douyin"]);
  assert.equal(result.acceptedClaimCount, 1);
  assert.deepEqual(Object.keys(result.blueprint.platformStructures), ["xiaohongshu", "douyin"]);
  assert.equal(result.blueprint.platformStructures.xiaohongshu.contentMode, "text_image_carousel_structure");
  assert.equal(result.blueprint.platformStructures.douyin.contentMode, "text_image_post_structure");
});

test("preserves exact accepted wording, uncertainty and both source roles without generating copy", () => {
  const result = buildAcceptedClaimDraftBlueprint(acceptanceRead, { editorialAngle: angle });
  const block = result.blueprint.approvedClaimBlocks[0];

  assert.equal(block.exactApprovedWording, acceptanceRead.receipt.claims[0].proposedClaim);
  assert.equal(block.uncertaintyNote, acceptanceRead.receipt.claims[0].reviewNote);
  assert.equal(block.rewriteAllowed, false);
  assert.deepEqual(result.blueprint.sourceLedger.map((source) => source.evidenceRole), ["independent", "original"]);
  assert.deepEqual(result.platformDrafts, { xiaohongshu: null, douyin: null });
  assert.equal(result.readyForCopyGeneration, false);
  assert.equal(result.draftGenerated, false);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
});

test("keeps fingerprints stable for reordered input and binds human angle or targets", () => {
  const first = buildAcceptedClaimDraftBlueprint(acceptanceRead, { editorialAngle: angle });
  const reordered = structuredClone(acceptanceRead);
  reordered.receipt.claims[0].sources.reverse();
  const same = buildAcceptedClaimDraftBlueprint(reordered, { editorialAngle: angle, targets: ["douyin", "xiaohongshu"] });
  const changedAngle = buildAcceptedClaimDraftBlueprint(acceptanceRead, { editorialAngle: `${angle} 先解释风险。` });
  const changedTargets = buildAcceptedClaimDraftBlueprint(acceptanceRead, { editorialAngle: angle, targets: ["xiaohongshu"] });

  assert.equal(first.blueprintFingerprint, same.blueprintFingerprint);
  assert.notEqual(first.blueprintFingerprint, changedAngle.blueprintFingerprint);
  assert.notEqual(first.blueprintFingerprint, changedTargets.blueprintFingerprint);
});

test("fails closed for missing durable acceptance, invalid claims or unsupported targets", async () => {
  const missing = buildAcceptedClaimDraftBlueprint({}, { editorialAngle: angle });
  assert.ok(missing.blockers.includes("human_claim_acceptance_read_not_ready"));

  const tampered = structuredClone(acceptanceRead);
  tampered.receipt.claims[0].sources[1].evidenceRole = "original";
  const invalid = buildAcceptedClaimDraftBlueprint(tampered, { editorialAngle: angle });
  assert.ok(invalid.blockers.includes("human_claim_acceptance_claims_invalid"));

  const unsupported = buildAcceptedClaimDraftBlueprint(acceptanceRead, { editorialAngle: angle, targets: ["tiktok"] });
  assert.ok(unsupported.blockers.includes("target_platform_unsupported"));
  assert.equal(unsupported.blueprint, null);

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("accepted-claim-draft-blueprint")));
});
