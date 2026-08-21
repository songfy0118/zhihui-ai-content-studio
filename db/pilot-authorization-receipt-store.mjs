const HASH = /^[a-f0-9]{64}$/;

export const INSERT_RECEIPT_SQL = `INSERT INTO pilot_authorization_receipts (
  id, candidate_request_hash, execution_request_hash, provider, image_model, video_model,
  image_cost_cny, video_cost_cny, quoted_total_cost_cny, max_cost_cny, pricing_confirmed,
  status, issued_at_ms, expires_at_ms, consumed_at_ms, external_calls, cost_incurred,
  execution_triggered, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, false, false, false, ?, ?)`;

export const CONSUME_RECEIPT_SQL = `UPDATE pilot_authorization_receipts
SET status = 'consumed', consumed_at_ms = ?, updated_at = ?
WHERE id = ? AND execution_request_hash = ? AND status = 'active' AND expires_at_ms > ?`;

export const INSPECT_RECEIPT_SQL = `SELECT id, execution_request_hash, status, expires_at_ms, consumed_at_ms
FROM pilot_authorization_receipts WHERE id = ?`;

export const EXPIRE_RECEIPT_SQL = `UPDATE pilot_authorization_receipts
SET status = 'expired', updated_at = ?
WHERE id = ? AND status = 'active' AND expires_at_ms <= ?`;

export const INSPECT_RECEIPT_TABLE_SQL = `SELECT name FROM sqlite_schema
WHERE type = 'table' AND name = 'pilot_authorization_receipts'`;

export const INSPECT_RECEIPT_INDEXES_SQL = `SELECT name FROM sqlite_schema
WHERE type = 'index' AND tbl_name = 'pilot_authorization_receipts'`;

export const CREATE_RECEIPT_TABLE_SQL = `CREATE TABLE IF NOT EXISTS \`pilot_authorization_receipts\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`candidate_request_hash\` text NOT NULL,
  \`execution_request_hash\` text NOT NULL,
  \`provider\` text NOT NULL,
  \`image_model\` text NOT NULL,
  \`video_model\` text NOT NULL,
  \`image_cost_cny\` real NOT NULL,
  \`video_cost_cny\` real NOT NULL,
  \`quoted_total_cost_cny\` real NOT NULL,
  \`max_cost_cny\` real NOT NULL,
  \`pricing_confirmed\` integer NOT NULL,
  \`status\` text DEFAULT 'active' NOT NULL,
  \`issued_at_ms\` integer NOT NULL,
  \`expires_at_ms\` integer NOT NULL,
  \`consumed_at_ms\` integer,
  \`external_calls\` integer DEFAULT false NOT NULL,
  \`cost_incurred\` integer DEFAULT false NOT NULL,
  \`execution_triggered\` integer DEFAULT false NOT NULL,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`;

export const CREATE_RECEIPT_EXECUTION_INDEX_SQL = `CREATE INDEX IF NOT EXISTS \`idx_pilot_receipts_execution_hash_issued_at\` ON \`pilot_authorization_receipts\` (\`execution_request_hash\`,\`issued_at_ms\`)`;
export const CREATE_RECEIPT_EXPIRY_INDEX_SQL = `CREATE INDEX IF NOT EXISTS \`idx_pilot_receipts_status_expires_at\` ON \`pilot_authorization_receipts\` (\`status\`,\`expires_at_ms\`)`;

const REQUIRED_INDEXES = ["idx_pilot_receipts_execution_hash_issued_at", "idx_pilot_receipts_status_expires_at"];

function safeResult(fields = {}) {
  return {
    externalCalls: false,
    costIncurred: false,
    executionTriggered: false,
    generatedMedia: false,
    publishable: false,
    ...fields,
  };
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export async function inspectPilotAuthorizationReceiptStorage(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  const [tableResult, indexResult] = await Promise.all([
    d1.prepare(INSPECT_RECEIPT_TABLE_SQL).all(),
    d1.prepare(INSPECT_RECEIPT_INDEXES_SQL).all(),
  ]);
  const tablePresent = Array.isArray(tableResult?.results) && tableResult.results.some((row) => row?.name === "pilot_authorization_receipts");
  if (!tablePresent) return safeResult({ status: "missing", verified: false, blockers: ["migration_missing"], tablePresent: false, indexesPresent: [], missingIndexes: REQUIRED_INDEXES, verification: "read_only_sqlite_schema" });
  const indexesPresent = Array.isArray(indexResult?.results) ? indexResult.results.map((row) => row?.name).filter((name) => typeof name === "string") : [];
  const missingIndexes = REQUIRED_INDEXES.filter((name) => !indexesPresent.includes(name));
  return safeResult({
    status: missingIndexes.length === 0 ? "verified" : "incomplete",
    verified: missingIndexes.length === 0,
    blockers: missingIndexes.length === 0 ? [] : ["migration_incomplete"],
    tablePresent: true,
    indexesPresent,
    missingIndexes,
    verification: "read_only_sqlite_schema",
  });
}

export async function applyPilotAuthorizationReceiptStorage(d1) {
  if (!d1 || typeof d1.prepare !== "function" || typeof d1.batch !== "function") throw new Error("d1_binding_required");
  const before = await inspectPilotAuthorizationReceiptStorage(d1);
  if (before.verified) return safeResult({ applied: false, alreadyApplied: true, blocker: null, databaseWrites: false, before, after: before });
  if (before.status !== "missing") return safeResult({ applied: false, alreadyApplied: false, blocker: "storage_status_not_safe_to_apply", databaseWrites: false, before, after: before });

  const results = await d1.batch([
    d1.prepare(CREATE_RECEIPT_TABLE_SQL),
    d1.prepare(CREATE_RECEIPT_EXECUTION_INDEX_SQL),
    d1.prepare(CREATE_RECEIPT_EXPIRY_INDEX_SQL),
  ]);
  if (!Array.isArray(results) || results.length !== 3 || results.some((result) => result?.success !== true)) {
    return safeResult({ applied: false, alreadyApplied: false, blocker: "receipt_migration_batch_failed", databaseWrites: true, before, after: null });
  }
  const after = await inspectPilotAuthorizationReceiptStorage(d1);
  return safeResult({
    applied: after.verified,
    alreadyApplied: false,
    blocker: after.verified ? null : "receipt_migration_verification_failed",
    databaseWrites: true,
    before,
    after,
  });
}

export function createPersistentPilotAuthorizationReceiptStore(d1, { now = () => Date.now() } = {}) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");

  return {
    async issue(input = {}) {
      const gate = input.gate;
      if (gate?.eligible !== true || !HASH.test(gate.requestHash ?? "") || !HASH.test(gate.executionRequestHash ?? "")) {
        return safeResult({ issued: false, blocker: "approval_gate_not_eligible", receipt: null });
      }
      const issuedAtMs = Number(input.issuedAtMs ?? now());
      const expiresAtMs = Number(input.expiresAtMs);
      const receiptId = typeof input.receiptId === "string" ? input.receiptId.trim() : "";
      const textFields = [input.provider, input.imageModel, input.videoModel];
      const costFields = [input.imageCostCny, input.videoCostCny, input.quotedTotalCostCny, input.maxCostCny];
      if (!receiptId || textFields.some((value) => typeof value !== "string" || value.trim() === "") || costFields.some((value) => !Number.isFinite(value) || value <= 0) || input.pricingConfirmed !== true || !Number.isFinite(expiresAtMs) || expiresAtMs <= issuedAtMs) {
        return safeResult({ issued: false, blocker: "authorization_receipt_input_invalid", receipt: null });
      }
      const timestamp = new Date(issuedAtMs).toISOString();
      const statement = d1.prepare(INSERT_RECEIPT_SQL).bind(
        receiptId,
        gate.requestHash,
        gate.executionRequestHash,
        input.provider.trim(),
        input.imageModel.trim(),
        input.videoModel.trim(),
        input.imageCostCny,
        input.videoCostCny,
        input.quotedTotalCostCny,
        input.maxCostCny,
        true,
        issuedAtMs,
        expiresAtMs,
        timestamp,
        timestamp,
      );
      const result = await statement.run();
      if (result?.success !== true || changes(result) !== 1) return safeResult({ issued: false, blocker: "authorization_receipt_insert_failed", receipt: null });
      return safeResult({ issued: true, blocker: null, receipt: { id: receiptId, executionRequestHash: gate.executionRequestHash, status: "active", issuedAtMs, expiresAtMs, consumedAtMs: null, singleUse: true } });
    },

    async consume({ receiptId, executionRequestHash, executionAuthorized = false } = {}) {
      if (executionAuthorized !== true) return safeResult({ consumed: false, adapterCallAuthorized: false, blocker: "explicit_execution_authorization_missing" });
      const nowMs = Number(now());
      const timestamp = new Date(nowMs).toISOString();
      const updated = await d1.prepare(CONSUME_RECEIPT_SQL).bind(nowMs, timestamp, receiptId, executionRequestHash, nowMs).run();
      if (updated?.success === true && changes(updated) === 1) {
        return safeResult({ consumed: true, durableConsumptionRecorded: true, adapterCallAuthorized: true, blocker: null, receiptId, executionRequestHash, consumedAtMs: nowMs });
      }

      const receipt = await d1.prepare(INSPECT_RECEIPT_SQL).bind(receiptId).first();
      if (!receipt) return safeResult({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_not_found" });
      if (receipt.status === "consumed") return safeResult({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_already_consumed" });
      if (Number(receipt.expires_at_ms) <= nowMs) {
        await d1.prepare(EXPIRE_RECEIPT_SQL).bind(timestamp, receiptId, nowMs).run();
        return safeResult({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_expired" });
      }
      if (receipt.execution_request_hash !== executionRequestHash) return safeResult({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_fingerprint_mismatch" });
      return safeResult({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_atomic_update_failed" });
    },
  };
}
