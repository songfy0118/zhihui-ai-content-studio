import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createSourceLockReader, READ_SOURCE_LOCK_SQL } from "../db/source-lock-reader.mjs";

const REVIEW_FINGERPRINT = "a".repeat(64);
const SAVE_PLAN_FINGERPRINT = "b".repeat(64);

async function memoryD1() {
  const database = new DatabaseSync(":memory:");
  const migration = await readFile(new URL("../drizzle/0007_silly_turbo.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  return {
    database,
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...params) {
          return { ...this, params };
        },
        all() {
          return { results: database.prepare(this.sql).all(...this.params) };
        },
      };
    },
  };
}

function seedLock(database, { evidenceCount = 2, status = "active" } = {}) {
  database.prepare(`INSERT INTO source_locks (
    id, lead_id, title, review_fingerprint, save_plan_fingerprint, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "source-lock-one",
    "cluster:one",
    "OpenAI launches enterprise agent platform",
    REVIEW_FINGERPRINT,
    SAVE_PLAN_FINGERPRINT,
    status,
    "2026-08-21T16:00:00.000Z",
    "2026-08-21T16:00:00.000Z",
  );
  const records = [
    ["a-one", "source-a", "Original", "OpenAI launches enterprise agent platform", "https://a.example/story", "2026-08-20T12:00:00.000Z", "original"],
    ["b-match", "source-b", "Independent", "Enterprise agent platform launched by OpenAI", "https://b.example/story", "2026-08-20T14:00:00.000Z", "independent"],
  ];
  for (const record of records.slice(0, evidenceCount)) {
    database.prepare(`INSERT INTO source_lock_evidence (
      source_lock_id, evidence_id, source_id, source_name, title, canonical_url, published_at, evidence_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run("source-lock-one", ...record, "2026-08-21T16:00:00.000Z");
  }
}

test("reads a complete active source lock as a stable read-only projection", async () => {
  const d1 = await memoryD1();
  seedLock(d1.database);
  const result = await createSourceLockReader(d1).readBySavePlanFingerprint(SAVE_PLAN_FINGERPRINT);

  assert.equal(result.status, "source_lock_read_ready");
  assert.equal(result.found, true);
  assert.match(result.readFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.record.evidence.length, 2);
  assert.deepEqual(result.record.evidence.map((item) => item.evidenceRole), ["independent", "original"]);
  assert.equal(result.databaseReads, 1);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.draftInputReady, false);
  assert.equal(result.factsVerified, false);
});

test("blocks invalid fingerprints before querying and reports a missing lock honestly", async () => {
  const d1 = await memoryD1();
  let prepareCalls = 0;
  const prepare = d1.prepare;
  d1.prepare = (...args) => {
    prepareCalls += 1;
    return prepare(...args);
  };
  const reader = createSourceLockReader(d1);
  const invalid = await reader.readBySavePlanFingerprint("not-a-fingerprint");
  assert.equal(invalid.databaseReadAttempted, false);
  assert.equal(prepareCalls, 0);

  const missing = await reader.readBySavePlanFingerprint(SAVE_PLAN_FINGERPRINT);
  assert.equal(missing.status, "source_lock_not_found");
  assert.equal(missing.found, false);
  assert.equal(missing.databaseReads, 1);
});

test("fails closed on incomplete or inactive persisted records", async () => {
  const incomplete = await memoryD1();
  seedLock(incomplete.database, { evidenceCount: 1 });
  const incompleteResult = await createSourceLockReader(incomplete).readBySavePlanFingerprint(SAVE_PLAN_FINGERPRINT);
  assert.ok(incompleteResult.blockers.includes("source_lock_evidence_count_invalid"));

  const inactive = await memoryD1();
  seedLock(inactive.database, { status: "revoked" });
  const inactiveResult = await createSourceLockReader(inactive).readBySavePlanFingerprint(SAVE_PLAN_FINGERPRINT);
  assert.ok(inactiveResult.blockers.includes("source_lock_record_invalid"));
  assert.equal(inactiveResult.record, null);
});

test("ships only SELECT access and remains disconnected from API routes", async () => {
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/source-lock-migration/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(READ_SOURCE_LOCK_SQL, /^SELECT/);
  assert.doesNotMatch(READ_SOURCE_LOCK_SQL, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i);
  assert.ok(routes.every((route) => !route.includes("source-lock-reader")));
});
