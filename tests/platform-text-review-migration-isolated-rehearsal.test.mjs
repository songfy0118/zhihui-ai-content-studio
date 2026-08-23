import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runPlatformTextReviewMigrationIsolatedRehearsal } from "../bridge/platform-text-review-migration-isolated-rehearsal.mjs";

const tags = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];

async function migrations() {
  return Promise.all(tags.map(async (tag) => ({
    tag,
    sql: await readFile(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8"),
  })));
}

test("verifies 0009 and 0010 success plus per-migration rollback only in memory", async () => {
  const result = runPlatformTextReviewMigrationIsolatedRehearsal({ migrations: await migrations() });
  assert.equal(result.status, "platform_text_review_migration_isolated_rehearsal_verified");
  assert.deepEqual(result.appliedTags, tags);
  assert.equal(result.tableCount, 5);
  assert.equal(result.indexCount, 12);
  assert.equal(result.schemaVerified, true);
  assert.equal(result.successPathVerified, true);
  assert.equal(result.rollbackScenarioCount, 2);
  assert.equal(result.rollbackVerifiedCount, 2);
  assert.equal(result.failurePathVerified, true);
  assert.ok(result.rollbackScenarios.every(({ rollbackPerformed, rollbackVerified }) => rollbackPerformed && rollbackVerified));
  assert.equal(result.ephemeralDatabaseWrites, true);
  assert.equal(result.liveDatabaseAccessed, false);
  assert.equal(result.liveDatabaseWrites, false);
  assert.equal(result.liveApplyPerformed, false);
  assert.equal(result.businessResult, false);
});

test("blocks incomplete, reordered and destructive migration inputs before any memory write", async () => {
  const valid = await migrations();
  const destructive = structuredClone(valid);
  destructive[0].sql += "\nDROP TABLE platform_text_draft_review_receipts;";
  for (const input of [valid.slice(0, 1), valid.toReversed(), destructive, []]) {
    const result = runPlatformTextReviewMigrationIsolatedRehearsal({ migrations: input });
    assert.deepEqual(result.blockers, ["platform_text_review_migration_rehearsal_input_invalid"]);
    assert.equal(result.ephemeralDatabaseWrites, false);
    assert.equal(result.liveDatabaseWrites, false);
  }
});

test("keeps the rehearsal route local and delegates only to the Node bridge", async () => {
  const [route, server] = await Promise.all([
    readFile(new URL("../app/api/news/platform-text-review-migration-isolated-rehearsal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(route, /export async function POST/);
  assert.match(route, /isLocalRequest/);
  assert.match(route, /\/d1\/review-migrations\/isolated/);
  assert.match(route, /liveDatabaseWrites:\s*false/);
  assert.doesNotMatch(route, /getD1|wrangler|readFile|\.insert\(|\.update\(|\.delete\(|\.batch\(/);
  assert.match(server, /request\.method === "POST"/);
  assert.match(server, /\/d1\/review-migrations\/isolated/);
  assert.match(server, /runPlatformTextReviewMigrationIsolatedRehearsal/);
});
