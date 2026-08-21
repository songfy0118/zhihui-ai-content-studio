import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { HUMAN_CLAIM_ACCEPTANCE_CHECKS } from "../bridge/human-claim-acceptance-preview.mjs";
import { createHumanClaimAcceptanceReader, READ_HUMAN_CLAIM_ACCEPTANCE_SQL } from "../db/human-claim-acceptance-reader.mjs";

const ACCEPTANCE_FINGERPRINT = "a".repeat(64);
const CLAIM_SELECTION_FINGERPRINT = "b".repeat(64);
const CLAIM_ID = "c".repeat(64);

async function memoryD1() {
  const database = new DatabaseSync(":memory:");
  const migration = await readFile(new URL("../drizzle/0008_overconfident_vance_astro.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  return {
    database,
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...params) { return { ...this, params }; },
        all() { return { results: database.prepare(this.sql).all(...this.params) }; },
      };
    },
  };
}

function seedReceipt(database, { status = "active", sourceCount = 2, checks = null } = {}) {
  const createdAt = "2026-08-21T19:10:00.000Z";
  database.prepare(`INSERT INTO human_claim_acceptance_receipts (
    id, claim_selection_fingerprint, acceptance_fingerprint, idempotency_key, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`).run(
    `hcap_${ACCEPTANCE_FINGERPRINT}`,
    CLAIM_SELECTION_FINGERPRINT,
    ACCEPTANCE_FINGERPRINT,
    `human-claim-acceptance:${ACCEPTANCE_FINGERPRINT}`,
    status,
    createdAt,
  );
  database.prepare(`INSERT INTO human_claim_acceptance_items (
    receipt_id, claim_id, proposed_claim, review_note, acceptance_checks_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`).run(
    `hcap_${ACCEPTANCE_FINGERPRINT}`,
    CLAIM_ID,
    "两条模拟来源均描述同一个虚构测试，但不代表真实新闻。",
    "人工接受谨慎措辞，并保留不确定性说明。",
    JSON.stringify(checks ?? Object.fromEntries(HUMAN_CLAIM_ACCEPTANCE_CHECKS.map((check) => [check, true]))),
    createdAt,
  );
  const sources = [
    ["d".repeat(64), "original-one", "official-source", "original", "https://official.example/release", "模拟官方来源描述虚构测试。"],
    ["e".repeat(64), "independent-one", "independent-source", "independent", "https://independent.example/report", "模拟独立来源描述同一虚构测试。"],
  ];
  for (const source of sources.slice(0, sourceCount)) {
    database.prepare(`INSERT INTO human_claim_acceptance_sources (
      receipt_id, claim_id, candidate_id, evidence_id, source_id, evidence_role,
      canonical_url, source_sentence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `hcap_${ACCEPTANCE_FINGERPRINT}`,
      CLAIM_ID,
      ...source,
      createdAt,
    );
  }
}

test("reads a durable human acceptance receipt as a stable research projection", async () => {
  const d1 = await memoryD1();
  seedReceipt(d1.database);
  const result = await createHumanClaimAcceptanceReader(d1).readByAcceptanceFingerprint(ACCEPTANCE_FINGERPRINT);

  assert.equal(result.status, "human_claim_acceptance_read_ready");
  assert.equal(result.found, true);
  assert.equal(result.durableHumanAcceptance, true);
  assert.equal(result.draftResearchInputReady, true);
  assert.equal(result.humanAcceptedClaims, 1);
  assert.match(result.readFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.receipt.claims[0].sources.map((source) => source.evidenceRole), ["independent", "original"]);
  assert.equal(result.databaseReads, 1);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.factsVerified, false);
  assert.equal(result.readyForCopyGeneration, false);
  assert.equal(result.draftGenerated, false);
});

test("blocks an invalid fingerprint before querying and reports a missing receipt honestly", async () => {
  const d1 = await memoryD1();
  let prepareCalls = 0;
  const prepare = d1.prepare;
  d1.prepare = (...args) => { prepareCalls += 1; return prepare(...args); };
  const reader = createHumanClaimAcceptanceReader(d1);

  const invalid = await reader.readByAcceptanceFingerprint("not-a-fingerprint");
  assert.equal(invalid.databaseReadAttempted, false);
  assert.equal(prepareCalls, 0);

  const missing = await reader.readByAcceptanceFingerprint(ACCEPTANCE_FINGERPRINT);
  assert.equal(missing.status, "human_claim_acceptance_not_found");
  assert.equal(missing.found, false);
  assert.equal(missing.databaseReads, 1);
});

test("fails closed on inactive, incomplete or malformed persisted acceptance data", async () => {
  const inactive = await memoryD1();
  seedReceipt(inactive.database, { status: "revoked" });
  const inactiveResult = await createHumanClaimAcceptanceReader(inactive).readByAcceptanceFingerprint(ACCEPTANCE_FINGERPRINT);
  assert.ok(inactiveResult.blockers.includes("human_claim_acceptance_receipt_invalid"));

  const incomplete = await memoryD1();
  seedReceipt(incomplete.database, { sourceCount: 1 });
  const incompleteResult = await createHumanClaimAcceptanceReader(incomplete).readByAcceptanceFingerprint(ACCEPTANCE_FINGERPRINT);
  assert.ok(incompleteResult.blockers.includes(`human_claim_acceptance_source_count_invalid:${CLAIM_ID}`));

  const malformed = await memoryD1();
  seedReceipt(malformed.database, { checks: { exact_claim_wording_approved: true } });
  const malformedResult = await createHumanClaimAcceptanceReader(malformed).readByAcceptanceFingerprint(ACCEPTANCE_FINGERPRINT);
  assert.ok(malformedResult.blockers.includes(`human_claim_acceptance_claim_invalid:${CLAIM_ID}`));
  assert.equal(malformedResult.draftResearchInputReady, false);
});

test("ships only SELECT access and remains disconnected from API routes", async () => {
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(READ_HUMAN_CLAIM_ACCEPTANCE_SQL, /^SELECT/);
  assert.doesNotMatch(READ_HUMAN_CLAIM_ACCEPTANCE_SQL, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i);
  assert.ok(routes.every((route) => !route.includes("human-claim-acceptance-reader")));
});
