import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  PLATFORM_TEXT_METRICS_SAVE_CONFIRMATION,
  createPlatformTextMetricsStore,
} from "../db/platform-text-metrics-store.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function confirmedSnapshot(platform) {
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
    sourceReference: platform === "xiaohongshu" ? "xiaohongshu-export-20260822.csv" : "douyin-api-report-20260822.json",
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
    reviewDecision: "confirmed_metric_snapshot_matches_published_post_and_source_evidence",
    reviewConfirmationSource: "human_visible_metrics_source_review",
    reviewChecks: {
      publishedPostUrlMatchesExternalPostId: true,
      contentFingerprintMatchesConfirmedDraft: true,
      sourceReferenceAndEvidenceFingerprintReviewed: true,
      captureWindowAndCountersReviewed: true,
      learningRemainsDisabledPendingSeparateReview: true,
    },
    reviewStatus: "human_confirmed_real_metric_snapshot_not_persisted",
  };
}

function readyReceipt(platforms = ["xiaohongshu", "douyin"]) {
  const confirmedMetricSnapshots = platforms.map(confirmedSnapshot);
  const confirmationPayload = {
    sourceDraftSaveReviewConfirmationFingerprint: "a".repeat(64),
    metricsImportPreviewFingerprint: "b".repeat(64),
    confirmedMetricSnapshots,
  };
  return {
    status: "platform_text_metrics_import_review_confirmation_accepted",
    blockers: [],
    sourceDraftSaveReviewConfirmationFingerprint: confirmationPayload.sourceDraftSaveReviewConfirmationFingerprint,
    confirmedMetricsImportPreviewFingerprint: confirmationPayload.metricsImportPreviewFingerprint,
    metricsImportReviewConfirmationFingerprint: hash(confirmationPayload),
    confirmedMetricSnapshots,
    confirmedSnapshotCount: confirmedMetricSnapshots.length,
    humanMetricsReviewCompleted: true,
    verifiedMetricsConfirmedByHuman: true,
    eligibleForAuthorizedStorage: true,
    storageAuthorizationGranted: false,
    storageWritePerformed: false,
    learningUpdateEligible: false,
    learningUpdateAuthorizationGranted: false,
    learningWeightsUpdated: false,
    platformApiCalled: false,
    exportFileRead: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

function createMemoryD1({ failAtStatement = null } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE metrics (
      id TEXT PRIMARY KEY, idea_id TEXT NOT NULL, platform TEXT NOT NULL,
      views INTEGER NOT NULL, likes INTEGER NOT NULL, comments INTEGER NOT NULL,
      shares INTEGER NOT NULL, saves INTEGER NOT NULL, followers INTEGER NOT NULL,
      completion_rate REAL NOT NULL, source_kind TEXT, external_post_id TEXT,
      captured_at TEXT, imported_at TEXT, content_fingerprint TEXT,
      published_post_url TEXT, published_at TEXT, source_reference TEXT,
      source_evidence_fingerprint TEXT, created_at TEXT NOT NULL,
      UNIQUE(platform, external_post_id, captured_at)
    );
  `);
  const prepare = (sql) => ({
    sql,
    params: [],
    bind(...params) { return { ...this, params }; },
    first() { return database.prepare(this.sql).get(...this.params); },
  });
  return {
    database,
    prepare,
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          if (index === failAtStatement) throw new Error("injected_batch_failure");
          const result = database.prepare(statement.sql).run(...statement.params);
          results.push({ success: true, meta: { changes: Number(result.changes) } });
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function saveInput(confirmationReceipt, overrides = {}) {
  return {
    confirmationReceipt,
    executeRequested: true,
    confirmation: PLATFORM_TEXT_METRICS_SAVE_CONFIRMATION,
    authorizedReviewConfirmationFingerprint: confirmationReceipt.metricsImportReviewConfirmationFingerprint,
    ...overrides,
  };
}

function count(database) {
  return Number(database.prepare("SELECT COUNT(*) AS count FROM metrics").get().count);
}

test("atomically stores two confirmed metrics snapshots in isolated memory", async () => {
  const d1 = createMemoryD1();
  const result = await createPlatformTextMetricsStore(d1, { now: () => "2026-08-22T13:20:00.000Z" }).save(saveInput(readyReceipt()));

  assert.equal(result.status, "platform_text_metrics_persisted");
  assert.equal(result.persisted, true);
  assert.equal(result.metricSnapshotsCreated, 2);
  assert.equal(result.metricIds.length, 2);
  assert.equal(count(d1.database), 2);
  assert.equal(result.databaseWrites, true);
  assert.equal(result.learningWeightsUpdated, false);
  assert.equal(result.publishTriggered, false);
});

test("replays identical confirmed snapshots without a second batch", async () => {
  const d1 = createMemoryD1();
  const receipt = readyReceipt();
  const store = createPlatformTextMetricsStore(d1);
  await store.save(saveInput(receipt));
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => { batchCalls += 1; return originalBatch(...args); };
  const replay = await store.save(saveInput(receipt));

  assert.equal(replay.status, "platform_text_metrics_already_persisted");
  assert.equal(replay.alreadyPersisted, true);
  assert.equal(replay.databaseWriteAttempted, false);
  assert.equal(batchCalls, 0);
  assert.equal(count(d1.database), 2);
});

test("blocks missing authorization and a tampered review receipt before batching", async () => {
  const d1 = createMemoryD1();
  const receipt = readyReceipt();
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => { batchCalls += 1; return originalBatch(...args); };
  const store = createPlatformTextMetricsStore(d1);
  const missing = await store.save(saveInput(receipt, { confirmation: null }));
  const tampered = structuredClone(receipt);
  tampered.confirmedMetricSnapshots[0].views += 1;
  const changed = await store.save(saveInput(tampered));

  assert.ok(missing.blockers.includes("platform_text_metrics_save_confirmation_invalid"));
  assert.ok(changed.blockers.includes("platform_text_metrics_review_confirmation_tampered"));
  assert.equal(batchCalls, 0);
  assert.equal(count(d1.database), 0);
});

test("rolls back every isolated metric when the atomic batch fails", async () => {
  const d1 = createMemoryD1({ failAtStatement: 1 });
  const result = await createPlatformTextMetricsStore(d1).save(saveInput(readyReceipt()));

  assert.equal(result.status, "platform_text_metrics_atomic_batch_failed");
  assert.equal(result.persisted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.databaseWriteAttempted, true);
  assert.equal(count(d1.database), 0);
});

test("keeps the isolated metrics store disconnected from routes and live D1", async () => {
  const [metricsRoute, previewRoute, journal, source] = await Promise.all([
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../db/platform-text-metrics-store.mjs", import.meta.url), "utf8"),
  ]);
  assert.ok([metricsRoute, previewRoute, journal].every((content) => !content.includes("platform-text-metrics-store")));
  assert.equal(source.includes("getDb"), false);
  assert.equal(source.includes("fetch("), false);
});
