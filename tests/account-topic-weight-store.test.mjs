import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { buildTopicWeightUpdateAuthorizationPreview } from "../bridge/topic-weight-update-authorization-preview.mjs";
import { createAccountTopicWeightStore } from "../db/account-topic-weight-store.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readyAuthorizationPreview() {
  const reviewChecks = {
    deltaAndWeightBoundsReviewed: true,
    noPredictionOrAutomaticUpdateAcknowledged: true,
    sampleCountAndAggregationReviewed: true,
    signalAndShrinkageReviewed: true,
  };
  const reviewedProposals = [{
    scope: "category",
    id: "ai",
    currentWeight: 1,
    suggestedWeight: 1.012,
    delta: 0.012,
    uniqueIdeaCount: 2,
    meanSignal: 0.8,
    status: "human_review_required_not_applied",
    reviewDecision: "approve_candidate_weight_change",
    reviewNote: "批准进入独立授权准备",
    reviewChecks,
    reviewStatus: "human_approved_candidate_not_applied",
  }];
  const reviewPayload = {
    profileId: "zhihui-ai-tech-finance-v1",
    weightUpdatePreviewFingerprint: "a".repeat(64),
    reviewedProposals,
  };
  return buildTopicWeightUpdateAuthorizationPreview({
    status: "topic_weight_update_review_confirmation_accepted",
    blockers: [],
    profileId: reviewPayload.profileId,
    confirmedWeightUpdatePreviewFingerprint: reviewPayload.weightUpdatePreviewFingerprint,
    topicWeightUpdateReviewFingerprint: hash(reviewPayload),
    reviewedProposals,
    reviewedProposalCount: 1,
    approvedProposals: reviewedProposals,
    approvedProposalCount: 1,
    rejectedProposalCount: 0,
    humanWeightReviewCompleted: true,
    eligibleForLearningUpdateAuthorization: true,
    learningUpdateEligible: false,
    learningUpdateAuthorizationGranted: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  });
}

function createMemoryD1({ baselineWeight = 1, failAtStatement = null } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE account_topic_weight_update_receipts (
      id TEXT PRIMARY KEY, profile_id TEXT NOT NULL,
      source_review_fingerprint TEXT NOT NULL UNIQUE,
      authorization_preview_fingerprint TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE account_topic_weight_update_items (
      receipt_id TEXT NOT NULL, scope TEXT NOT NULL, weight_key TEXT NOT NULL,
      previous_weight REAL NOT NULL, applied_weight REAL NOT NULL, delta REAL NOT NULL,
      source_unique_idea_count INTEGER NOT NULL, source_mean_signal REAL NOT NULL,
      created_at TEXT NOT NULL, UNIQUE(receipt_id, scope, weight_key)
    );
    CREATE TABLE account_topic_weight_values (
      profile_id TEXT NOT NULL, scope TEXT NOT NULL, weight_key TEXT NOT NULL,
      weight REAL NOT NULL, source_update_receipt_id TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(profile_id, scope, weight_key)
    );
  `);
  database.prepare(`INSERT INTO account_topic_weight_values (
    profile_id, scope, weight_key, weight, source_update_receipt_id, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)`).run(
    "zhihui-ai-tech-finance-v1", "category", "ai", baselineWeight,
    "seed_initial_profile", "2026-08-22T13:00:00.000Z",
  );
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

function saveInput(authorizationPreview, overrides = {}) {
  return {
    authorizationPreview,
    executeRequested: true,
    confirmation: authorizationPreview.requiredConfirmation,
    authorizedPreviewFingerprint: authorizationPreview.weightUpdateAuthorizationPreviewFingerprint,
    ...overrides,
  };
}

function count(database, table) {
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

function currentWeight(database) {
  return database.prepare("SELECT weight, source_update_receipt_id FROM account_topic_weight_values").get();
}

test("atomically stores one reviewed weight update in isolated memory", async () => {
  const d1 = createMemoryD1();
  const preview = readyAuthorizationPreview();
  const result = await createAccountTopicWeightStore(d1, { now: () => "2026-08-22T14:30:00.000Z" })
    .save(saveInput(preview));

  assert.equal(result.status, "account_topic_weight_update_persisted_in_isolated_store");
  assert.equal(result.persisted, true);
  assert.equal(result.updateItemsCreated, 1);
  assert.equal(result.weightValuesChanged, 1);
  assert.equal(count(d1.database, "account_topic_weight_update_receipts"), 1);
  assert.equal(count(d1.database, "account_topic_weight_update_items"), 1);
  assert.equal(currentWeight(d1.database).weight, 1.012);
  assert.match(currentWeight(d1.database).source_update_receipt_id, /^atwu_[a-f0-9]{64}$/);
  assert.equal(result.learningWeightsUpdated, false);
  assert.equal(result.liveD1Connected, false);
  assert.equal(result.businessResult, false);
});

test("replays the same authorized update without a second batch", async () => {
  const d1 = createMemoryD1();
  const preview = readyAuthorizationPreview();
  const store = createAccountTopicWeightStore(d1);
  await store.save(saveInput(preview));
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => { batchCalls += 1; return originalBatch(...args); };
  const replay = await store.save(saveInput(preview));

  assert.equal(replay.status, "account_topic_weight_update_already_persisted");
  assert.equal(replay.alreadyPersisted, true);
  assert.equal(replay.databaseWriteAttempted, false);
  assert.equal(batchCalls, 0);
  assert.equal(count(d1.database, "account_topic_weight_update_receipts"), 1);
  assert.equal(count(d1.database, "account_topic_weight_update_items"), 1);
});

test("blocks missing authorization, tampering and baseline drift before batching", async () => {
  const preview = readyAuthorizationPreview();
  const d1 = createMemoryD1();
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => { batchCalls += 1; return originalBatch(...args); };
  const store = createAccountTopicWeightStore(d1);
  const missing = await store.save(saveInput(preview, { confirmation: null }));
  const tampered = structuredClone(preview);
  tampered.updateTargets[0].suggestedWeight += 0.01;
  const changed = await store.save(saveInput(tampered));
  const drifted = createMemoryD1({ baselineWeight: 0.99 });
  const drift = await createAccountTopicWeightStore(drifted).save(saveInput(preview));

  assert.ok(missing.blockers.includes("account_topic_weight_update_save_confirmation_invalid"));
  assert.ok(changed.blockers.includes("topic_weight_update_authorization_preview_tampered"));
  assert.equal(drift.status, "account_topic_weight_update_baseline_mismatch");
  assert.equal(batchCalls, 0);
  assert.equal(count(d1.database, "account_topic_weight_update_receipts"), 0);
  assert.equal(currentWeight(drifted.database).weight, 0.99);
});

test("rolls back receipt, item and weight when the isolated batch fails", async () => {
  const d1 = createMemoryD1({ failAtStatement: 2 });
  const result = await createAccountTopicWeightStore(d1).save(saveInput(readyAuthorizationPreview()));

  assert.equal(result.status, "account_topic_weight_update_atomic_batch_failed");
  assert.equal(result.persisted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.databaseWriteAttempted, true);
  assert.equal(count(d1.database, "account_topic_weight_update_receipts"), 0);
  assert.equal(count(d1.database, "account_topic_weight_update_items"), 0);
  assert.equal(currentWeight(d1.database).weight, 1);
});

test("keeps the isolated weight store disconnected from routes and live D1", async () => {
  const [rankedRoute, metricsRoute, journal, source] = await Promise.all([
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../db/account-topic-weight-store.mjs", import.meta.url), "utf8"),
  ]);
  assert.ok([rankedRoute, metricsRoute, journal].every((content) => !content.includes("account-topic-weight-store")));
  assert.doesNotMatch(source, /\bgetDb\b|\bfetch\s*\(|wrangler|migrations apply/);
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir|rmSync|unlink/);
});
