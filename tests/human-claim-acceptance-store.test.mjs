import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { buildClaimReviewMaterialPreview } from "../bridge/claim-review-material-preview.mjs";
import { HUMAN_CLAIM_ACCEPTANCE_CHECKS, HUMAN_CLAIM_ACCEPTANCE_CONFIRMATION, buildHumanClaimAcceptancePreview } from "../bridge/human-claim-acceptance-preview.mjs";
import { HUMAN_CLAIM_SELECTION_CHECKS, buildHumanClaimSelectionPlan } from "../bridge/human-claim-selection-plan.mjs";
import { buildTextDraftBriefPreview } from "../bridge/text-draft-brief-preview.mjs";
import { HUMAN_CLAIM_ACCEPTANCE_SAVE_CONFIRMATION, createHumanClaimAcceptanceStore } from "../db/human-claim-acceptance-store.mjs";

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function readyPreview() {
  const brief = buildTextDraftBriefPreview({
    status: "source_lock_read_ready",
    found: true,
    readFingerprint: "a".repeat(64),
    record: {
      id: "lock-one", leadId: "lead-one", title: "Synthetic topic", status: "active",
      savePlanFingerprint: "b".repeat(64), reviewFingerprint: "c".repeat(64),
      evidence: [
        { evidenceId: "original-one", sourceId: "official-source", sourceName: "Official", title: "Synthetic release", canonicalUrl: "https://official.example/release", publishedAt: "2026-08-20T12:00:00.000Z", evidenceRole: "original" },
        { evidenceId: "independent-one", sourceId: "independent-source", sourceName: "Independent", title: "Synthetic report", canonicalUrl: "https://independent.example/report", publishedAt: "2026-08-20T14:00:00.000Z", evidenceRole: "independent" },
      ],
    },
  }, { editorialAngle: "人工确认模拟事件" });
  const documents = [
    { evidenceId: "original-one", sourceId: "official-source", evidenceRole: "original", canonicalUrl: "https://official.example/release", text: "The synthetic official source describes a fictional test for three regions next month. All scope, date and number details still require human review before any use.", ephemeral: true },
    { evidenceId: "independent-one", sourceId: "independent-source", evidenceRole: "independent", canonicalUrl: "https://independent.example/report", text: "The synthetic independent source mentions the same fictional three-region test next month. This fixture remains unverified and does not establish a real event.", ephemeral: true },
  ].map((document) => ({ ...document, textHash: hash(document.text) }));
  const material = buildClaimReviewMaterialPreview({ status: "public_article_acquisition_complete", sourceBodiesFetched: true, documents }, brief);
  const selection = buildHumanClaimSelectionPlan(material, [{
    decisionId: "claim-one",
    proposedClaim: "两条模拟来源均提到下月覆盖三个地区的虚构测试，但真实性仍未确认。",
    supportingCandidateIds: material.sourceMaterials.map((source) => source.candidates[0].candidateId),
    checks: Object.fromEntries(HUMAN_CLAIM_SELECTION_CHECKS.map((check) => [check, true])),
  }], { confirmedMaterialFingerprint: material.candidateMaterialFingerprint });
  return buildHumanClaimAcceptancePreview(selection, [{
    claimId: selection.plannedClaims[0].claimId,
    accept: true,
    reviewNote: "接受当前谨慎措辞，但必须保留真实性尚未确认的说明。",
    checks: Object.fromEntries(HUMAN_CLAIM_ACCEPTANCE_CHECKS.map((check) => [check, true])),
  }], {
    confirmedClaimSelectionFingerprint: selection.claimSelectionFingerprint,
    confirmation: HUMAN_CLAIM_ACCEPTANCE_CONFIRMATION,
  });
}

function createMemoryD1({ failAtStatement = null } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE human_claim_acceptance_receipts (
      id TEXT PRIMARY KEY, claim_selection_fingerprint TEXT NOT NULL,
      acceptance_fingerprint TEXT NOT NULL UNIQUE, idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE human_claim_acceptance_items (
      receipt_id TEXT NOT NULL, claim_id TEXT NOT NULL, proposed_claim TEXT NOT NULL,
      review_note TEXT NOT NULL, acceptance_checks_json TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(receipt_id, claim_id)
    );
    CREATE TABLE human_claim_acceptance_sources (
      receipt_id TEXT NOT NULL, claim_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL, source_id TEXT NOT NULL, evidence_role TEXT NOT NULL,
      canonical_url TEXT NOT NULL, source_sentence TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(receipt_id, claim_id, evidence_role)
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

function saveInput(preview, overrides = {}) {
  return {
    preview,
    executeRequested: true,
    confirmation: HUMAN_CLAIM_ACCEPTANCE_SAVE_CONFIRMATION,
    authorizedAcceptanceFingerprint: preview.acceptanceFingerprint,
    ...overrides,
  };
}

function count(database, table) {
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

test("atomically stores one acceptance receipt, its claim and both source roles in memory", async () => {
  const d1 = createMemoryD1();
  const preview = readyPreview();
  const result = await createHumanClaimAcceptanceStore(d1, { now: () => "2026-08-21T18:45:00.000Z" }).save(saveInput(preview));

  assert.equal(result.status, "human_claim_acceptance_persisted");
  assert.equal(result.persisted, true);
  assert.equal(result.acceptanceReceiptsCreated, 1);
  assert.equal(result.claimItemsCreated, 1);
  assert.equal(result.sourceLinksCreated, 2);
  assert.equal(count(d1.database, "human_claim_acceptance_receipts"), 1);
  assert.equal(count(d1.database, "human_claim_acceptance_items"), 1);
  assert.equal(count(d1.database, "human_claim_acceptance_sources"), 2);
  assert.equal(result.readyForCopyGeneration, false);
});

test("replays the same acceptance fingerprint idempotently without a second batch", async () => {
  const d1 = createMemoryD1();
  const preview = readyPreview();
  const store = createHumanClaimAcceptanceStore(d1);
  await store.save(saveInput(preview));
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => { batchCalls += 1; return originalBatch(...args); };
  const replay = await store.save(saveInput(preview));

  assert.equal(replay.alreadyPersisted, true);
  assert.equal(replay.databaseWriteAttempted, false);
  assert.equal(batchCalls, 0);
  assert.equal(count(d1.database, "human_claim_acceptance_receipts"), 1);
});

test("blocks missing authorization and tampered previews before a batch", async () => {
  const d1 = createMemoryD1();
  const preview = readyPreview();
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => { batchCalls += 1; return originalBatch(...args); };
  const store = createHumanClaimAcceptanceStore(d1);
  const missing = await store.save(saveInput(preview, { confirmation: null }));
  const tampered = structuredClone(preview);
  tampered.receiptPreview.acceptedClaims[0].proposedClaim += "篡改";
  const changed = await store.save(saveInput(tampered));

  assert.ok(missing.blockers.includes("human_claim_acceptance_save_confirmation_invalid"));
  assert.ok(changed.blockers.includes("human_claim_acceptance_preview_tampered"));
  assert.equal(batchCalls, 0);
  assert.equal(count(d1.database, "human_claim_acceptance_receipts"), 0);
});

test("rolls back every isolated table when one source insert fails", async () => {
  const d1 = createMemoryD1({ failAtStatement: 2 });
  const result = await createHumanClaimAcceptanceStore(d1).save(saveInput(readyPreview()));

  assert.equal(result.status, "human_claim_acceptance_atomic_batch_failed");
  assert.equal(result.persisted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(count(d1.database, "human_claim_acceptance_receipts"), 0);
  assert.equal(count(d1.database, "human_claim_acceptance_items"), 0);
  assert.equal(count(d1.database, "human_claim_acceptance_sources"), 0);
});

test("keeps the isolated store disconnected from routes, migrations and live D1", async () => {
  const [previewRoute, handoffRoute, journal] = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  ]);
  assert.ok([previewRoute, handoffRoute, journal].every((content) => !content.includes("human-claim-acceptance-store")));
});
