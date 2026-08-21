import { randomUUID } from "node:crypto";

const EXECUTION_HASH = /^[a-f0-9]{64}$/;
const validConsumptions = new WeakSet();

function outcome(fields = {}) {
  return {
    externalCalls: false,
    costIncurred: false,
    executionTriggered: false,
    generatedMedia: false,
    publishable: false,
    ...fields,
  };
}

export function isValidPilotReceiptConsumption(consumption, executionRequestHash) {
  return Boolean(
    consumption
    && validConsumptions.has(consumption)
    && consumption.consumed === true
    && consumption.executionRequestHash === executionRequestHash,
  );
}

export function createPilotAuthorizationReceiptStore({
  now = () => Date.now(),
  idFactory = () => randomUUID(),
  ttlMs = 10 * 60 * 1000,
} = {}) {
  if (!(Number.isFinite(ttlMs) && ttlMs > 0 && ttlMs <= 15 * 60 * 1000)) throw new Error("receipt_ttl_out_of_range");
  const receipts = new Map();

  return {
    issue({ gate } = {}) {
      const blockers = [];
      if (gate?.eligible !== true) blockers.push("approval_gate_not_eligible");
      if (!EXECUTION_HASH.test(gate?.executionRequestHash ?? "")) blockers.push("execution_fingerprint_missing");
      if (blockers.length > 0) return outcome({ issued: false, blockers, receipt: null });

      const issuedAtMs = Number(now());
      const receipt = {
        id: idFactory(),
        executionRequestHash: gate.executionRequestHash,
        issuedAtMs,
        expiresAtMs: issuedAtMs + ttlMs,
        consumedAtMs: null,
        status: "active",
        singleUse: true,
      };
      receipts.set(receipt.id, receipt);
      return outcome({ issued: true, blockers: [], receipt: { ...receipt } });
    },

    inspect(receiptId) {
      const receipt = receipts.get(receiptId);
      return receipt ? { ...receipt } : null;
    },

    consume({ receiptId, executionRequestHash, executionAuthorized = false } = {}) {
      if (executionAuthorized !== true) return outcome({ consumed: false, adapterCallAuthorized: false, blocker: "explicit_execution_authorization_missing" });
      const receipt = receipts.get(receiptId);
      if (!receipt) return outcome({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_not_found" });
      if (receipt.status === "consumed") return outcome({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_already_consumed" });
      if (Number(now()) >= receipt.expiresAtMs) {
        receipts.set(receipt.id, { ...receipt, status: "expired" });
        return outcome({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_expired" });
      }
      if (executionRequestHash !== receipt.executionRequestHash) return outcome({ consumed: false, adapterCallAuthorized: false, blocker: "authorization_receipt_fingerprint_mismatch" });

      const consumedAtMs = Number(now());
      const consumedReceipt = { ...receipt, status: "consumed", consumedAtMs };
      receipts.set(receipt.id, consumedReceipt);
      const decision = outcome({
        consumed: true,
        adapterCallAuthorized: true,
        blocker: null,
        receiptId: receipt.id,
        executionRequestHash: receipt.executionRequestHash,
        consumedAtMs,
      });
      validConsumptions.add(decision);
      return decision;
    },
  };
}
