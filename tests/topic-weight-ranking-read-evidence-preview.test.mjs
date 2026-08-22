import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fingerprintTopicWeightRankingIsolatedReadResult,
} from "../bridge/topic-weight-ranking-isolated-read-adapter.mjs";
import {
  buildTopicWeightRankingReadEvidencePreview,
} from "../bridge/topic-weight-ranking-read-evidence-preview.mjs";

function plan() {
  return {
    status: "topic_weight_ranking_live_read_plan_ready",
    profileId: "zhihui-ai-tech-finance-v1",
    liveReadPlanFingerprint: "b".repeat(64),
    requestedWeights: [
      { scope: "category", id: "technology" },
      { scope: "topic", id: "technology" },
    ],
    queryCount: 5,
  };
}

function weight(scope) {
  return {
    profileId: "zhihui-ai-tech-finance-v1",
    scope,
    id: "technology",
    weight: 1,
    previousWeight: 0.95,
    delta: 0.05,
    sourceUniqueIdeaCount: 3,
    sourceMeanSignal: 0.8,
    sourceReviewFingerprint: "c".repeat(64),
    authorizationPreviewFingerprint: "a".repeat(64),
    updateReceiptId: `atwu_${"a".repeat(64)}`,
    updatedAt: "2026-08-22T14:30:00.000Z",
    integrityStatus: "complete_active_update_receipt_read_only",
  };
}

function isolatedResult() {
  const result = {
    status: "topic_weight_ranking_isolated_read_complete",
    profileId: "zhihui-ai-tech-finance-v1",
    sourceLiveReadPlanFingerprint: "b".repeat(64),
    storageStatus: "verified",
    storageVerified: true,
    weights: [weight("category"), weight("topic")],
    weightCount: 2,
    queryAttemptCount: 5,
    queryCompletionCount: 5,
    executionMode: "isolated_simulation",
    simulatedReadPerformed: true,
    liveExecutionImplemented: false,
    liveReadPerformed: false,
    inspectedDataRows: true,
    eligibleForRankingWeightInput: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    permissionExpansionRequested: false,
    credentialsRequested: false,
    publishTriggered: false,
    businessResult: false,
  };
  return {
    ...result,
    isolatedReadResultFingerprint: fingerprintTopicWeightRankingIsolatedReadResult(result),
  };
}

test("builds a deterministic evidence summary for human review", () => {
  const input = { plan: plan(), isolatedReadResult: isolatedResult() };
  const first = buildTopicWeightRankingReadEvidencePreview(input);
  const repeat = buildTopicWeightRankingReadEvidencePreview(structuredClone(input));

  assert.equal(first.status, "topic_weight_ranking_read_evidence_preview_ready");
  assert.equal(first.readEvidencePreviewFingerprint, repeat.readEvidencePreviewFingerprint);
  assert.equal(first.schemaEvidence.storageStatus, "verified");
  assert.equal(first.queryEvidence.completedQueryCount, 5);
  assert.equal(first.weightEvidence.length, 2);
  assert.equal(first.reviewChecklist.length, 5);
  assert.equal(first.requiredConfirmation, `REVIEW ISOLATED TOPIC WEIGHT EVIDENCE ${first.readEvidencePreviewFingerprint}`);
});

test("preserves exact receipt-backed weight evidence without performance claims", () => {
  const preview = buildTopicWeightRankingReadEvidencePreview({
    plan: plan(),
    isolatedReadResult: isolatedResult(),
  });

  assert.deepEqual(preview.weightEvidence.map(({ scope, id, previousWeight, weight: value, delta }) => ({
    scope,
    id,
    previousWeight,
    weight: value,
    delta,
  })), [
    { scope: "category", id: "technology", previousWeight: 0.95, weight: 1, delta: 0.05 },
    { scope: "topic", id: "technology", previousWeight: 0.95, weight: 1, delta: 0.05 },
  ]);
  assert.equal("predictedViews" in preview, false);
  assert.equal("viralProbability" in preview, false);
});

test("blocks a tampered result fingerprint and plan mismatch", () => {
  const tampered = isolatedResult();
  tampered.weights[0].weight = 1.1;
  const mismatched = isolatedResult();
  mismatched.sourceLiveReadPlanFingerprint = "d".repeat(64);

  assert.ok(buildTopicWeightRankingReadEvidencePreview({ plan: plan(), isolatedReadResult: tampered }).blockers.includes(
    "isolated_read_result_invalid_or_tampered",
  ));
  assert.ok(buildTopicWeightRankingReadEvidencePreview({ plan: plan(), isolatedReadResult: mismatched }).blockers.includes(
    "isolated_read_result_plan_mismatch",
  ));
});

test("blocks incomplete reads and any false live or activation boundary", () => {
  const incomplete = isolatedResult();
  incomplete.queryCompletionCount = 4;
  incomplete.isolatedReadResultFingerprint = fingerprintTopicWeightRankingIsolatedReadResult(incomplete);
  const falseLive = isolatedResult();
  falseLive.liveReadPerformed = true;
  falseLive.eligibleForRankingWeightInput = true;
  falseLive.isolatedReadResultFingerprint = fingerprintTopicWeightRankingIsolatedReadResult(falseLive);

  assert.ok(buildTopicWeightRankingReadEvidencePreview({ plan: plan(), isolatedReadResult: incomplete }).blockers.includes(
    "isolated_read_evidence_incomplete",
  ));
  assert.ok(buildTopicWeightRankingReadEvidencePreview({ plan: plan(), isolatedReadResult: falseLive }).blockers.includes(
    "isolated_read_safety_boundary_invalid",
  ));
});

test("preview remains non-persisted, non-live and disconnected from ranking routes", async () => {
  const preview = buildTopicWeightRankingReadEvidencePreview({
    plan: plan(),
    isolatedReadResult: isolatedResult(),
  });
  const [source, route, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-read-evidence-preview.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(preview.evidenceKind, "isolated_simulation_only");
  assert.equal(preview.humanReviewCompleted, false);
  assert.equal(preview.liveD1EvidenceAvailable, false);
  assert.equal(preview.eligibleForRankingActivation, false);
  assert.equal(preview.rankingWeightsApplied, false);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.configurationWrites, false);
  assert.equal(preview.externalCalls, false);
  assert.equal(preview.publishTriggered, false);
  assert.equal(preview.businessResult, false);
  assert.doesNotMatch(source, /process\.env|\.prepare\s*\(|\bfetch\s*\(|api[_-]?key|token|password|secret/i);
  assert.ok([route, page].every((content) => !content.includes("topic-weight-ranking-read-evidence-preview")));
});
