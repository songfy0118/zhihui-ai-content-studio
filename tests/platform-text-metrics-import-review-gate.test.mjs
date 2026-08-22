import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextMetricsImportReviewConfirmation } from "../bridge/platform-text-metrics-import-review-gate.mjs";

const requiredStorageExtension = [
  "content_fingerprint",
  "published_post_url",
  "published_at",
  "source_reference",
  "source_evidence_fingerprint",
];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function metricSnapshot(platform) {
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
    importedAt: "2026-08-22T12:30:00.000Z",
    importStatus: "human_review_pending_not_persisted",
  };
}

function readyPreview(platforms = ["xiaohongshu", "douyin"]) {
  const metricSnapshots = platforms.map(metricSnapshot);
  const fingerprintPayload = {
    sourceDraftSaveReviewConfirmationFingerprint: "a".repeat(64),
    metricSnapshots,
    requiredStorageExtension,
  };
  const metricsImportPreviewFingerprint = hash(fingerprintPayload);
  return {
    status: "platform_text_metrics_import_human_review_pending",
    blockers: [],
    sourceDraftSaveReviewConfirmationFingerprint: fingerprintPayload.sourceDraftSaveReviewConfirmationFingerprint,
    metricsImportPreviewFingerprint,
    requiredConfirmation: `REVIEW VERIFIED METRICS IMPORT ${metricsImportPreviewFingerprint}`,
    metricSnapshots,
    snapshotCount: metricSnapshots.length,
    realDataOnly: true,
    acceptedSources: ["platform_api", "platform_export"],
    requiredStorageExtension,
    eligibleForHumanImportReview: true,
    humanImportReviewCompleted: false,
    storageAuthorizationGranted: false,
    learningUpdateEligible: false,
    platformApiCalled: false,
    exportFileRead: false,
    databaseWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

function decisionsFor(preview) {
  return preview.metricSnapshots.map((snapshot) => ({
    platform: snapshot.platform,
    externalPostId: snapshot.externalPostId,
    capturedAt: snapshot.capturedAt,
    sourceEvidenceFingerprint: snapshot.sourceEvidenceFingerprint,
    decision: "confirmed_metric_snapshot_matches_published_post_and_source_evidence",
    confirmationSource: "human_visible_metrics_source_review",
    checks: {
      publishedPostUrlMatchesExternalPostId: true,
      contentFingerprintMatchesConfirmedDraft: true,
      sourceReferenceAndEvidenceFingerprintReviewed: true,
      captureWindowAndCountersReviewed: true,
      learningRemainsDisabledPendingSeparateReview: true,
    },
  }));
}

function acceptedInput(preview = readyPreview()) {
  return {
    preview,
    reviewRequested: true,
    confirmation: preview.requiredConfirmation,
    confirmedMetricsImportPreviewFingerprint: preview.metricsImportPreviewFingerprint,
    decisions: decisionsFor(preview),
  };
}

test("accepts exact human review of two real metrics snapshots deterministically", () => {
  const input = acceptedInput();
  const first = assessPlatformTextMetricsImportReviewConfirmation(input);
  const repeat = assessPlatformTextMetricsImportReviewConfirmation(structuredClone(input));

  assert.equal(first.status, "platform_text_metrics_import_review_confirmation_accepted");
  assert.equal(first.metricsImportReviewConfirmationFingerprint, repeat.metricsImportReviewConfirmationFingerprint);
  assert.equal(first.confirmedSnapshotCount, 2);
  assert.deepEqual(first.confirmedMetricSnapshots.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.humanMetricsReviewCompleted, true);
  assert.equal(first.verifiedMetricsConfirmedByHuman, true);
  assert.equal(first.eligibleForAuthorizedStorage, true);
});

test("binds review evidence while leaving storage and learning unauthorized", () => {
  const preview = readyPreview();
  const result = assessPlatformTextMetricsImportReviewConfirmation(acceptedInput(preview));

  for (const [index, confirmed] of result.confirmedMetricSnapshots.entries()) {
    const snapshot = preview.metricSnapshots[index];
    assert.equal(confirmed.externalPostId, snapshot.externalPostId);
    assert.equal(confirmed.capturedAt, snapshot.capturedAt);
    assert.equal(confirmed.sourceEvidenceFingerprint, snapshot.sourceEvidenceFingerprint);
    assert.equal(confirmed.reviewStatus, "human_confirmed_real_metric_snapshot_not_persisted");
  }
  assert.equal(result.storageAuthorizationGranted, false);
  assert.equal(result.storageWritePerformed, false);
  assert.equal(result.learningUpdateEligible, false);
  assert.equal(result.learningUpdateAuthorizationGranted, false);
  assert.equal(result.learningWeightsUpdated, false);
  assert.equal(result.databaseWrites, false);
});

test("blocks missing intent, wrong confirmation and a stale preview fingerprint", () => {
  const preview = readyPreview();
  const result = assessPlatformTextMetricsImportReviewConfirmation({
    preview,
    reviewRequested: false,
    confirmation: "wrong",
    confirmedMetricsImportPreviewFingerprint: "f".repeat(64),
    decisions: decisionsFor(preview),
  });

  assert.deepEqual(result.blockers, [
    "metrics_import_review_not_requested",
    "metrics_import_review_confirmation_invalid",
    "metrics_import_preview_fingerprint_mismatch",
  ]);
  assert.equal(result.verifiedMetricsConfirmedByHuman, false);
  assert.equal(result.eligibleForAuthorizedStorage, false);
});

test("blocks incomplete checks, reordered decisions and a tampered preview", () => {
  const incompletePreview = readyPreview();
  const incomplete = acceptedInput(incompletePreview);
  incomplete.decisions[0].checks.captureWindowAndCountersReviewed = false;
  assert.ok(assessPlatformTextMetricsImportReviewConfirmation(incomplete).blockers.includes(
    "metrics_import_review_decisions_invalid_or_incomplete",
  ));

  const reorderedPreview = readyPreview();
  const reordered = acceptedInput(reorderedPreview);
  reordered.decisions.reverse();
  assert.equal(assessPlatformTextMetricsImportReviewConfirmation(reordered).confirmedSnapshotCount, 0);

  const tamperedPreview = readyPreview();
  tamperedPreview.metricSnapshots[0].views += 1;
  assert.ok(assessPlatformTextMetricsImportReviewConfirmation(acceptedInput(tamperedPreview)).blockers.includes(
    "metrics_import_preview_invalid_or_tampered",
  ));
});

test("supports one Douyin snapshot and performs no API, file, database or route action", async () => {
  const preview = readyPreview(["douyin"]);
  const result = assessPlatformTextMetricsImportReviewConfirmation(acceptedInput(preview));
  const source = await readFile(new URL("../bridge/platform-text-metrics-import-review-gate.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.confirmedSnapshotCount, 1);
  assert.equal(result.platformApiCalled, false);
  assert.equal(result.exportFileRead, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-metrics-import-review-gate")));
});
