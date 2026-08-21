import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessHumanClaimAcceptanceMigrationPreflight } from "../bridge/human-claim-acceptance-migration-preflight.mjs";
import { HUMAN_CLAIM_ACCEPTANCE_SCHEMA_SQL, inspectHumanClaimAcceptanceStorage } from "../db/human-claim-acceptance-storage-inspector.mjs";

const objects = [
  ["human_claim_acceptance_receipts", "table"],
  ["human_claim_acceptance_items", "table"],
  ["human_claim_acceptance_sources", "table"],
  ["uq_human_claim_acceptance_fingerprint", "index"],
  ["uq_human_claim_acceptance_idempotency_key", "index"],
  ["idx_human_claim_acceptance_selection_created_at", "index"],
  ["uq_human_claim_acceptance_items_receipt_claim", "index"],
  ["idx_human_claim_acceptance_items_claim_id", "index"],
  ["uq_human_claim_acceptance_sources_receipt_claim_role", "index"],
  ["idx_human_claim_acceptance_sources_candidate_id", "index"],
  ["idx_human_claim_acceptance_sources_source_id", "index"],
];
const columns = {
  human_claim_acceptance_receipts: ["id", "claim_selection_fingerprint", "acceptance_fingerprint", "idempotency_key", "status", "created_at"],
  human_claim_acceptance_items: ["receipt_id", "claim_id", "proposed_claim", "review_note", "acceptance_checks_json", "created_at"],
  human_claim_acceptance_sources: ["receipt_id", "claim_id", "candidate_id", "evidence_id", "source_id", "evidence_role", "canonical_url", "source_sentence", "created_at"],
};

function fakeD1({ schemaObjects = objects, tableColumns = columns } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      return {
        async all() {
          if (sql.includes("sqlite_schema")) return { results: schemaObjects.map(([name, type]) => ({ name, type })) };
          const table = Object.keys(columns).find((name) => sql.includes(name));
          return { results: (tableColumns[table] ?? []).map((name) => ({ name })) };
        },
      };
    },
  };
}

test("verifies every expected table, index and column using read-only schema queries", async () => {
  const d1 = fakeD1();
  const result = await inspectHumanClaimAcceptanceStorage(d1);

  assert.equal(result.status, "verified");
  assert.equal(result.verified, true);
  assert.equal(result.expectedObjectCount, 11);
  assert.equal(result.expectedColumnCount, 21);
  assert.deepEqual(result.missingObjects, []);
  assert.deepEqual(result.missingColumns, []);
  assert.equal(result.inspectedDataRows, false);
  assert.ok(d1.calls.every((sql) => /^SELECT name, type FROM sqlite_schema|^PRAGMA table_info/.test(sql)));
  assert.equal(result.databaseWrites, false);
});

test("distinguishes entirely missing storage from a partial schema", async () => {
  const missing = await inspectHumanClaimAcceptanceStorage(fakeD1({ schemaObjects: [], tableColumns: {} }));
  const partialColumns = structuredClone(columns);
  partialColumns.human_claim_acceptance_sources = partialColumns.human_claim_acceptance_sources.filter((name) => name !== "evidence_role");
  const partial = await inspectHumanClaimAcceptanceStorage(fakeD1({ schemaObjects: objects.slice(0, -1), tableColumns: partialColumns }));

  assert.equal(missing.status, "missing");
  assert.deepEqual(missing.blockers, ["claim_acceptance_storage_missing"]);
  assert.equal(partial.status, "partial");
  assert.ok(partial.missingObjects.includes("index:idx_human_claim_acceptance_sources_source_id"));
  assert.ok(partial.missingColumns.includes("human_claim_acceptance_sources.evidence_role"));
});

test("feeds only the observed status into the create-only migration decision", async () => {
  const sql = await readFile(new URL("../drizzle/0008_overconfident_vance_astro.sql", import.meta.url), "utf8");
  const missing = await inspectHumanClaimAcceptanceStorage(fakeD1({ schemaObjects: [], tableColumns: {} }));
  const verified = await inspectHumanClaimAcceptanceStorage(fakeD1());
  const missingPlan = assessHumanClaimAcceptanceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: "0008_overconfident_vance_astro", migrationSql: sql, storageStatus: missing.status });
  const verifiedPlan = assessHumanClaimAcceptanceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: "0008_overconfident_vance_astro", migrationSql: sql, storageStatus: verified.status });

  assert.equal(missingPlan.readyToApplyLocally, true);
  assert.equal(missingPlan.applyImplemented, false);
  assert.equal(verifiedPlan.readyToApplyLocally, false);
  assert.ok(verifiedPlan.blockers.includes("migration_already_applied"));
});

test("keeps the inspector out of API routes and contains no write SQL", async () => {
  const [previewRoute, migrationRoute] = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/source-lock-migration/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok([previewRoute, migrationRoute].every((content) => !content.includes("human-claim-acceptance-storage-inspector")));
  assert.doesNotMatch(HUMAN_CLAIM_ACCEPTANCE_SCHEMA_SQL, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
});
