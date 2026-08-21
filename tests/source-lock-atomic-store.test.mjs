import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";
import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";
import { createSourceLockStore, SOURCE_LOCK_SAVE_CONFIRMATION } from "../db/source-lock-store.mjs";

const lead = {
  id: "cluster:one",
  title: "OpenAI launches enterprise agent platform",
  sourceId: "source-a",
  publishedAt: "2026-08-20T12:00:00.000Z",
  missingIndependentSources: 1,
  suggestedQueries: ["OpenAI enterprise agent platform"],
  evidence: [{ id: "a-one", sourceId: "source-a", sourceName: "Original", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://a.example/story", publishedAt: "2026-08-20T12:00:00.000Z" }],
};
const sources = [
  { id: "source-a", name: "Original", sourceType: "rss", baseUrl: "https://a.example/", feedUrl: "https://a.example/feed", enabled: true, requiresLogin: false },
  { id: "source-b", name: "Independent", sourceType: "rss", baseUrl: "https://b.example/", feedUrl: "https://b.example/feed", enabled: true, requiresLogin: false },
];

function readyPlan() {
  const searchPlan = buildEvidenceSearchPlan([lead], [lead.id], sources);
  const metadata = buildEvidenceMetadataPreview(searchPlan, [{ id: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z" }]);
  const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));
  const review = buildEvidenceReviewPreview(searchPlan, metadata, [{ leadId: lead.id, candidateId: "b-match", checks }]);
  return buildSourceLockSavePlan(review, { confirmedReviewFingerprint: review.reviewFingerprint });
}

async function createMemoryD1({ failAtStatement = null } = {}) {
  const database = new DatabaseSync(":memory:");
  const migration = await readFile(new URL("../drizzle/0007_silly_turbo.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);

  const bindable = (sql) => ({
    sql,
    params: [],
    bind(...params) {
      return { ...this, params };
    },
    first() {
      return database.prepare(this.sql).get(...this.params);
    },
  });

  return {
    database,
    prepare: bindable,
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          if (failAtStatement === index) throw new Error("injected_batch_failure");
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

function saveInput(plan, overrides = {}) {
  return {
    plan,
    executeRequested: true,
    confirmation: SOURCE_LOCK_SAVE_CONFIRMATION,
    authorizedSavePlanFingerprint: plan.savePlanFingerprint,
    ...overrides,
  };
}

function rowCount(database, table) {
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

test("persists one reviewed source lock and both evidence roles in an isolated atomic batch", async () => {
  const d1 = await createMemoryD1();
  const plan = readyPlan();
  const store = createSourceLockStore(d1, { now: () => "2026-08-21T16:00:00.000Z" });
  const result = await store.save(saveInput(plan));

  assert.equal(result.persisted, true);
  assert.equal(result.sourceLocksCreated, 1);
  assert.equal(rowCount(d1.database, "source_locks"), 1);
  assert.equal(rowCount(d1.database, "source_lock_evidence"), 2);
  assert.deepEqual(d1.database.prepare("SELECT evidence_role FROM source_lock_evidence ORDER BY evidence_role").all().map((row) => row.evidence_role), ["independent", "original"]);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
});

test("replays the same save plan idempotently without another batch", async () => {
  const d1 = await createMemoryD1();
  const plan = readyPlan();
  const store = createSourceLockStore(d1);
  await store.save(saveInput(plan));
  const replay = await store.save(saveInput(plan));

  assert.equal(replay.alreadyPersisted, true);
  assert.equal(replay.databaseWriteAttempted, false);
  assert.equal(rowCount(d1.database, "source_locks"), 1);
  assert.equal(rowCount(d1.database, "source_lock_evidence"), 2);
});

test("blocks missing authorization and mismatched fingerprints before preparing a batch", async () => {
  const d1 = await createMemoryD1();
  const plan = readyPlan();
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => {
    batchCalls += 1;
    return originalBatch(...args);
  };
  const store = createSourceLockStore(d1);

  const noConfirmation = await store.save(saveInput(plan, { confirmation: null }));
  const wrongFingerprint = await store.save(saveInput(plan, { authorizedSavePlanFingerprint: "0".repeat(64) }));
  assert.equal(noConfirmation.persisted, false);
  assert.equal(wrongFingerprint.persisted, false);
  assert.equal(batchCalls, 0);
  assert.equal(rowCount(d1.database, "source_locks"), 0);
});

test("rolls back the entire isolated batch when an evidence insert fails", async () => {
  const d1 = await createMemoryD1({ failAtStatement: 1 });
  const plan = readyPlan();
  const result = await createSourceLockStore(d1).save(saveInput(plan));

  assert.equal(result.status, "source_lock_atomic_batch_failed");
  assert.equal(result.persisted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(rowCount(d1.database, "source_locks"), 0);
  assert.equal(rowCount(d1.database, "source_lock_evidence"), 0);
});

test("keeps the writer disconnected from every route and live database", async () => {
  const [savePlanRoute, localMigrationRoute] = await Promise.all([
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/source-lock-migration/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(savePlanRoute, /source-lock-store|\.batch\(|\.run\(/);
  assert.doesNotMatch(localMigrationRoute, /source-lock-store/);
});
