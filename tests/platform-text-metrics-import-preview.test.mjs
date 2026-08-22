import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextMetricsImportPreview } from "../bridge/platform-text-metrics-import-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function confirmedDraft(platform) {
  return {
    platform,
    pageUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/new/note-manager"
      : "https://creator.douyin.com/creator-micro/content/manage",
    confirmedAccount: {
      identityLabel: platform === "xiaohongshu" ? "测试小红书账号" : "测试抖音账号",
      accountHandle: null,
    },
    draftReference: `simulated-${platform}-draft`,
    expectedFieldFingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
    expectedAssetFingerprints: [platform === "xiaohongshu" ? "3".repeat(64) : "4".repeat(64)],
    decision: "confirmed_saved_draft_matches_reviewed_inputs",
    confirmationSource: "human_visible_creator_draft_manager_review",
    checks: {
      visibleAccountMatchesConfirmedAccount: true,
      draftReferenceMatchesExecutionResult: true,
      draftIsVisibleInCreatorDraftManager: true,
      draftContentAndAssetsMatchReviewedFingerprints: true,
      publicationRemainsUntriggered: true,
    },
    confirmationStatus: "human_confirmed_saved_draft_visible_not_published",
  };
}

function readyConfirmation(platforms = ["xiaohongshu", "douyin"]) {
  const confirmedDrafts = platforms.map(confirmedDraft);
  const confirmationPayload = {
    sourceContractFingerprint: "a".repeat(64),
    reviewPreviewFingerprint: "b".repeat(64),
    confirmedDrafts,
  };
  return {
    status: "platform_text_creator_draft_save_review_confirmation_accepted",
    blockers: [],
    sourceContractFingerprint: confirmationPayload.sourceContractFingerprint,
    confirmedReviewPreviewFingerprint: confirmationPayload.reviewPreviewFingerprint,
    draftSaveReviewConfirmationFingerprint: hash(confirmationPayload),
    confirmedDrafts,
    confirmedDraftCount: confirmedDrafts.length,
    visibleHumanDraftReviewCompleted: true,
    draftSaveVerifiedByHuman: true,
    manualPublishDecisionRequired: true,
    publicationAuthorizationGranted: false,
    browserInteractionPerformedByGate: false,
    loginStateRead: false,
    loginTriggered: false,
    draftSaveTriggeredByGate: false,
    draftSavedByGate: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
}

function metricRecord(platform) {
  const externalPostId = platform === "xiaohongshu" ? "xhs-post-1" : "douyin-post-1";
  return {
    ideaId: platform === "xiaohongshu" ? "idea-xhs-1" : "idea-douyin-1",
    platform,
    contentFingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
    externalPostId,
    publishedPostUrl: platform === "xiaohongshu"
      ? `https://www.xiaohongshu.com/explore/${externalPostId}`
      : `https://www.douyin.com/video/${externalPostId}`,
    publishedAt: "2026-08-22T10:00:00.000Z",
    capturedAt: "2026-08-22T12:00:00.000Z",
    sourceKind: platform === "xiaohongshu" ? "platform_export" : "platform_api",
    sourceReference: platform === "xiaohongshu"
      ? "xiaohongshu-export-20260822.csv"
      : "douyin-api-report-20260822.json",
    sourceEvidenceFingerprint: platform === "xiaohongshu" ? "5".repeat(64) : "6".repeat(64),
    views: platform === "xiaohongshu" ? 120 : 200,
    likes: 20,
    comments: 3,
    shares: 2,
    saves: 8,
    followers: 1,
    completionRate: 42.5,
  };
}

function readyInput(platforms = ["xiaohongshu", "douyin"]) {
  return {
    draftReviewConfirmation: readyConfirmation(platforms),
    records: platforms.map(metricRecord),
    now: "2026-08-22T12:30:00.000Z",
  };
}

test("builds a deterministic two-platform metrics import review preview", () => {
  const input = readyInput();
  const first = buildPlatformTextMetricsImportPreview(input);
  const repeat = buildPlatformTextMetricsImportPreview(structuredClone(input));

  assert.equal(first.status, "platform_text_metrics_import_human_review_pending");
  assert.equal(first.metricsImportPreviewFingerprint, repeat.metricsImportPreviewFingerprint);
  assert.equal(first.snapshotCount, 2);
  assert.deepEqual(first.metricSnapshots.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.requiredConfirmation, `REVIEW VERIFIED METRICS IMPORT ${first.metricsImportPreviewFingerprint}`);
  assert.equal(first.eligibleForHumanImportReview, true);
  assert.equal(first.realDataOnly, true);
});

test("binds metrics to confirmed content and preserves source evidence without enabling learning", () => {
  const input = readyInput();
  const result = buildPlatformTextMetricsImportPreview(input);

  for (const [index, snapshot] of result.metricSnapshots.entries()) {
    const draft = input.draftReviewConfirmation.confirmedDrafts[index];
    const record = input.records[index];
    assert.equal(snapshot.contentFingerprint, draft.expectedFieldFingerprint);
    assert.equal(snapshot.sourceEvidenceFingerprint, record.sourceEvidenceFingerprint);
    assert.equal(snapshot.importedAt, input.now);
    assert.equal(snapshot.importStatus, "human_review_pending_not_persisted");
  }
  assert.ok(result.requiredStorageExtension.includes("source_evidence_fingerprint"));
  assert.equal(result.storageAuthorizationGranted, false);
  assert.equal(result.learningUpdateEligible, false);
  assert.equal(result.databaseWrites, false);
});

test("rejects unverified sources, invalid counters, future capture and mismatched post URLs", () => {
  const cases = [
    (input) => { input.records[0].sourceKind = "manual_entry"; },
    (input) => { input.records[0].views = -1; },
    (input) => { input.records[0].views = Number.MAX_SAFE_INTEGER + 1; },
    (input) => { input.records[0].completionRate = Number.NaN; },
    (input) => { input.records[0].capturedAt = "2026-08-22T13:00:00.000Z"; },
    (input) => { input.records[0].publishedPostUrl = "https://example.com/post/xhs-post-1"; },
  ];
  for (const mutate of cases) {
    const input = readyInput();
    mutate(input);
    const result = buildPlatformTextMetricsImportPreview(input);
    assert.equal(result.status, "platform_text_metrics_import_preview_blocked");
    assert.ok(result.blockers.includes("metrics_import_record_invalid_unverified_or_duplicate"));
    assert.equal(result.snapshotCount, 0);
  }
});

test("rejects a tampered draft receipt, duplicate snapshots and unexpected secret fields", () => {
  const tampered = readyInput();
  tampered.draftReviewConfirmation.confirmedDrafts[0].expectedFieldFingerprint = "f".repeat(64);
  assert.ok(buildPlatformTextMetricsImportPreview(tampered).blockers.includes(
    "draft_save_review_confirmation_invalid_or_tampered",
  ));

  const duplicate = readyInput();
  duplicate.records[1] = structuredClone(duplicate.records[0]);
  assert.equal(buildPlatformTextMetricsImportPreview(duplicate).eligibleForHumanImportReview, false);

  const secretBearing = readyInput();
  secretBearing.records[0].apiToken = "must-not-be-accepted";
  assert.equal(buildPlatformTextMetricsImportPreview(secretBearing).snapshotCount, 0);
});

test("supports one Douyin snapshot and performs no API, file, database or route action", async () => {
  const result = buildPlatformTextMetricsImportPreview(readyInput(["douyin"]));
  const source = await readFile(new URL("../bridge/platform-text-metrics-import-preview.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.snapshotCount, 1);
  assert.equal(result.platformApiCalled, false);
  assert.equal(result.exportFileRead, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-metrics-import-preview")));
});
