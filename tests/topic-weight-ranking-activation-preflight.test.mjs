import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildTopicWeightRankingImpactPreview } from "../bridge/topic-weight-ranking-impact-preview.mjs";
import { assessTopicWeightRankingImpactReview } from "../bridge/topic-weight-ranking-impact-review-gate.mjs";
import {
  buildTopicWeightRankingActivationAuthorizationPreview,
} from "../bridge/topic-weight-ranking-activation-authorization-preview.mjs";
import { assessTopicWeightRankingActivationPreflight } from "../bridge/topic-weight-ranking-activation-preflight.mjs";
import {
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS,
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS,
  ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL,
  inspectAccountTopicWeightStorage,
} from "../db/account-topic-weight-storage-inspector.mjs";

function cluster(id, title, category) {
  return {
    id,
    title,
    category,
    sourceCount: 2,
    itemCount: 2,
    sourceIds: [`${id}-source-a`, `${id}-source-b`],
    firstSeenAt: "2026-08-21T10:00:00.000Z",
    lastSeenAt: "2026-08-21T12:00:00.000Z",
    meanSimilarity: 0.85,
    eligibleForHotspotScoring: true,
    evidence: [
      { id: `${id}-a`, title: `${title} official report`, sourceId: `${id}-source-a` },
      { id: `${id}-b`, title: `${title} independent report`, sourceId: `${id}-source-b` },
    ],
  };
}

function readyWeightProjection() {
  const authorizationPreviewFingerprint = "a".repeat(64);
  const weights = [{
    profileId: "zhihui-ai-tech-finance-v1",
    scope: "category",
    id: "technology",
    weight: 1,
    previousWeight: 0.95,
    delta: 0.05,
    sourceUniqueIdeaCount: 3,
    sourceMeanSignal: 0.8,
    sourceReviewFingerprint: "c".repeat(64),
    authorizationPreviewFingerprint,
    updateReceiptId: `atwu_${authorizationPreviewFingerprint}`,
    updatedAt: "2026-08-22T14:30:00.000Z",
    integrityStatus: "complete_active_update_receipt_read_only",
  }];
  return {
    status: "account_topic_weight_projection_ready",
    blockers: [],
    profileId: "zhihui-ai-tech-finance-v1",
    weights,
    weightCount: weights.length,
    complete: true,
    inspectedDataRows: true,
    eligibleForRankingWeightInput: true,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

function buildChain() {
  const weightProjection = readyWeightProjection();
  const impactPreview = buildTopicWeightRankingImpactPreview({
    clustering: {
      clusters: [
        cluster("technology-cluster", "Cloud software developer platform", "technology"),
        cluster("finance-cluster", "Federal Reserve inflation outlook", "macro_finance"),
      ],
    },
    weightProjection,
    now: "2026-08-21T13:00:00.000Z",
  });
  const candidateReviews = impactPreview.candidates.map((candidate) => ({
    candidateId: candidate.id,
    title: candidate.title,
    baseRank: candidate.baseRank,
    previewRank: candidate.previewRank,
    accountFitDelta: candidate.accountFitDelta,
    relativePriorityDelta: candidate.relativePriorityDelta,
    reviewNote: "已人工核对候选身份、分数差值和名次变化",
    checks: {
      candidateIdentityAndOrderReviewed: true,
      noPredictionOrAutomaticActivationAcknowledged: true,
      scoreAndRankDeltaReviewed: true,
      trendEvidenceUnchangedAcknowledged: true,
    },
  }));
  const reviewConfirmation = assessTopicWeightRankingImpactReview({
    preview: impactPreview,
    reviewRequested: true,
    confirmation: `REVIEW TOPIC WEIGHT RANKING IMPACT ${impactPreview.rankingImpactPreviewFingerprint}`,
    confirmedRankingImpactPreviewFingerprint: impactPreview.rankingImpactPreviewFingerprint,
    candidateReviews,
    overallDecision: "accept_ranking_impact_for_future_authorization",
    overallReviewNote: "排序变化符合账号方向，可进入后续独立启用授权评估",
  });
  const authorizationPreview = buildTopicWeightRankingActivationAuthorizationPreview(reviewConfirmation);
  return { authorizationPreview, reviewConfirmation, impactPreview, weightProjection };
}

function fakeVerifiedD1() {
  const columns = Object.fromEntries(Object.entries(ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS)
    .map(([table, names]) => [table, [...names]]));
  return {
    prepare(sql) {
      return {
        async all() {
          if (sql === ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL) {
            return { results: ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS.map((object) => {
              const [type, name] = object.split(":");
              return { type, name };
            }) };
          }
          const table = sql.match(/PRAGMA table_info\(`([^`]+)`\)/)?.[1];
          return { results: (columns[table] ?? []).map((name) => ({ name })) };
        },
      };
    },
  };
}

async function readyInput() {
  return {
    ...buildChain(),
    storageInspection: await inspectAccountTopicWeightStorage(fakeVerifiedD1()),
    evidenceContext: {
      binding: "DB",
      inspectionScope: "live_d1_read_only",
      inspectedAt: "2026-08-22T15:10:00.000Z",
      weightProjectionReadAt: "2026-08-22T15:11:00.000Z",
    },
    now: "2026-08-22T15:12:00.000Z",
  };
}

test("builds a deterministic linked read-only activation preflight", async () => {
  const input = await readyInput();
  const first = assessTopicWeightRankingActivationPreflight(input);
  const repeat = assessTopicWeightRankingActivationPreflight(structuredClone(input));

  assert.equal(first.status, "topic_weight_ranking_activation_preflight_ready");
  assert.equal(first.activationPreflightFingerprint, repeat.activationPreflightFingerprint);
  assert.equal(first.authorizationChainVerified, true);
  assert.equal(first.rankingImpactVerified, true);
  assert.equal(first.receiptBackedWeightsVerified, true);
  assert.equal(first.liveMigrationVerified, true);
  assert.equal(first.rollbackPlanPrepared, true);
  assert.equal(first.readyForExplicitActivationAuthorizationRequest, true);
  assert.equal(first.rankingActivationAuthorizationGranted, false);
});

test("prepares a reversible no-delete rollback plan without executing it", async () => {
  const result = assessTopicWeightRankingActivationPreflight(await readyInput());

  assert.equal(result.rollbackPlan.strategy, "restore_default_account_profile_in_memory");
  assert.equal(result.rollbackPlan.scope, "ranking_profile_resolution_only");
  assert.equal(result.rollbackPlan.preservesStoredWeights, true);
  assert.equal(result.rollbackPlan.requiresNoDataDeletion, true);
  assert.equal(result.rollbackPlan.dryRunRequired, true);
  assert.equal(result.rollbackPlan.rollbackExecutable, false);
  assert.equal(result.rollbackPlan.rollbackAuthorized, false);
  assert.equal(result.activationAdapterImplemented, false);
  assert.equal(result.productionRankingUpdated, false);
});

test("blocks stale or non-live evidence and missing storage", async () => {
  const isolated = await readyInput();
  isolated.evidenceContext.inspectionScope = "isolated_test";
  const stale = await readyInput();
  stale.evidenceContext.inspectedAt = "2026-08-22T14:00:00.000Z";
  const missing = await readyInput();
  missing.storageInspection = await inspectAccountTopicWeightStorage({
    prepare() { return { async all() { return { results: [] }; } }; },
  });

  for (const input of [isolated, stale, missing]) {
    const result = assessTopicWeightRankingActivationPreflight(input);
    assert.equal(result.status, "topic_weight_ranking_activation_preflight_blocked");
    assert.equal(result.readyForExplicitActivationAuthorizationRequest, false);
    assert.ok(result.blockers.includes("live_topic_weight_storage_verification_required"));
  }
});

test("blocks tampered authorization, impact and weight projection chains", async () => {
  const authorization = await readyInput();
  authorization.authorizationPreview.activationTarget.activationAllowed = true;
  const impact = await readyInput();
  impact.impactPreview.candidates[0].previewRank = 2;
  const weights = await readyInput();
  weights.weightProjection.weights[0].weight = 0.99;

  assert.ok(assessTopicWeightRankingActivationPreflight(authorization).blockers.includes(
    "ranking_activation_authorization_chain_invalid_or_tampered",
  ));
  assert.ok(assessTopicWeightRankingActivationPreflight(impact).blockers.includes(
    "ranking_impact_preview_invalid_or_fingerprint_mismatch",
  ));
  assert.ok(assessTopicWeightRankingActivationPreflight(weights).blockers.includes(
    "live_receipt_backed_weight_projection_required",
  ));
});

test("preflight remains disconnected from routes, writes and publication", async () => {
  const result = assessTopicWeightRankingActivationPreflight(await readyInput());
  const [source, rankedRoute, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-activation-preflight.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(result.databaseWrites, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bgetDb\b|\bdb\s*\.\s*(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir|rmSync|unlink/);
  assert.ok([rankedRoute, page].every((content) => !content.includes("topic-weight-ranking-activation-preflight")));
});
