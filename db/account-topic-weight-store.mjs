import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TARGET_KEYS = Object.freeze([
  "currentWeight",
  "delta",
  "id",
  "operation",
  "requiresDurableAccountProfileStore",
  "requiresExactReviewFingerprint",
  "scope",
  "sourceMeanSignal",
  "sourceUniqueIdeaCount",
  "suggestedWeight",
  "targetStatus",
  "updateAllowed",
]);

export const INSPECT_ACCOUNT_TOPIC_WEIGHT_UPDATE_SQL = `SELECT
  r.id, r.profile_id, r.source_review_fingerprint,
  r.authorization_preview_fingerprint, r.idempotency_key, r.status,
  (SELECT COUNT(*) FROM account_topic_weight_update_items i
   WHERE i.receipt_id = r.id) AS item_count
FROM account_topic_weight_update_receipts r
WHERE r.authorization_preview_fingerprint = ?`;

export const INSPECT_ACCOUNT_TOPIC_WEIGHT_ITEM_SQL = `SELECT
  receipt_id, scope, weight_key, previous_weight, applied_weight, delta,
  source_unique_idea_count, source_mean_signal
FROM account_topic_weight_update_items
WHERE receipt_id = ? AND scope = ? AND weight_key = ?`;

export const INSPECT_ACCOUNT_TOPIC_WEIGHT_VALUE_SQL = `SELECT
  profile_id, scope, weight_key, weight, source_update_receipt_id, updated_at
FROM account_topic_weight_values
WHERE profile_id = ? AND scope = ? AND weight_key = ?`;

const INSERT_UPDATE_RECEIPT_SQL = `INSERT INTO account_topic_weight_update_receipts (
  id, profile_id, source_review_fingerprint, authorization_preview_fingerprint,
  idempotency_key, status, created_at
) VALUES (?, ?, ?, ?, ?, 'active', ?)`;

const INSERT_GUARDED_UPDATE_ITEM_SQL = `INSERT INTO account_topic_weight_update_items (
  receipt_id, scope, weight_key, previous_weight, applied_weight, delta,
  source_unique_idea_count, source_mean_signal, created_at
) VALUES (
  ?, ?, ?,
  (SELECT weight FROM account_topic_weight_values
   WHERE profile_id = ? AND scope = ? AND weight_key = ? AND weight = ?),
  ?, ?, ?, ?, ?
)`;

const UPDATE_ACCOUNT_TOPIC_WEIGHT_SQL = `UPDATE account_topic_weight_values
SET weight = ?, source_update_receipt_id = ?, updated_at = ?
WHERE profile_id = ? AND scope = ? AND weight_key = ? AND weight = ?`;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify(keys);
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeResult(fields = {}) {
  return {
    status: "account_topic_weight_update_save_blocked",
    blockers: [],
    eligible: false,
    persisted: false,
    alreadyPersisted: false,
    updateReceiptCreated: false,
    updateItemsCreated: 0,
    weightValuesChanged: 0,
    databaseWriteAttempted: false,
    databaseWrites: false,
    atomicBatch: true,
    baselineWeightsVerified: false,
    isolatedVerificationOnly: true,
    liveD1Connected: false,
    migrationApplied: false,
    learningUpdateAuthorizationGranted: false,
    learningWeightsUpdated: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validTarget(target) {
  return exactKeys(target, TARGET_KEYS)
    && ["category", "topic"].includes(target?.scope)
    && SAFE_ID.test(target?.id ?? "")
    && Number.isFinite(target?.currentWeight)
    && target.currentWeight >= 0.5
    && target.currentWeight <= 1.5
    && Number.isFinite(target?.suggestedWeight)
    && target.suggestedWeight >= 0.5
    && target.suggestedWeight <= 1.5
    && Number.isFinite(target?.delta)
    && target.delta !== 0
    && Math.abs(target.delta) <= 0.05
    && target.suggestedWeight === rounded(target.currentWeight + target.delta)
    && Number.isSafeInteger(target?.sourceUniqueIdeaCount)
    && target.sourceUniqueIdeaCount >= 2
    && Number.isFinite(target?.sourceMeanSignal)
    && target.sourceMeanSignal >= 0
    && target.sourceMeanSignal <= 1
    && target?.operation === "apply_human_reviewed_weight_after_separate_authorization_and_preflight"
    && target?.targetStatus === "preview_only_not_authorized_not_implemented"
    && target?.requiresExactReviewFingerprint === true
    && target?.requiresDurableAccountProfileStore === true
    && target?.updateAllowed === false;
}

function validateAuthorizationPreview(preview, blockers) {
  if (
    preview?.status !== "topic_weight_update_authorization_preview_ready"
    || !Array.isArray(preview?.blockers)
    || preview.blockers.length !== 0
    || !SAFE_ID.test(preview?.profileId ?? "")
    || !HASH.test(preview?.sourceReviewFingerprint ?? "")
    || !HASH.test(preview?.weightUpdateAuthorizationPreviewFingerprint ?? "")
    || !Array.isArray(preview?.updateTargets)
    || preview.updateTargets.length < 1
    || preview?.targetCount !== preview.updateTargets.length
    || preview?.eligibleForExplicitLearningUpdateAuthorization !== true
    || preview?.learningUpdateAuthorizationGranted !== false
    || preview?.applicationAdapterImplemented !== false
    || preview?.applicationPreflightCompleted !== false
    || preview?.learningUpdateEligible !== false
    || preview?.learningWeightsUpdated !== false
    || preview?.configurationWrites !== false
    || preview?.databaseWrites !== false
    || preview?.filesystemMutations !== false
    || preview?.externalCalls !== false
    || preview?.publishTriggered !== false
    || preview?.businessResult !== false
  ) {
    blockers.push("topic_weight_update_authorization_preview_not_ready");
    return;
  }

  const identities = new Set();
  for (const target of preview.updateTargets) {
    const identity = `${target?.scope}:${target?.id}`;
    if (!validTarget(target) || identities.has(identity)) {
      blockers.push(`topic_weight_update_target_invalid:${identity}`);
    }
    identities.add(identity);
  }
  const fingerprintPayload = {
    profileId: preview.profileId,
    sourceReviewFingerprint: preview.sourceReviewFingerprint,
    updateTargets: preview.updateTargets,
  };
  if (hash(fingerprintPayload) !== preview.weightUpdateAuthorizationPreviewFingerprint) {
    blockers.push("topic_weight_update_authorization_preview_tampered");
  }
  if (preview.requiredConfirmation !== `AUTHORIZE REVIEWED TOPIC WEIGHT UPDATE ${preview.weightUpdateAuthorizationPreviewFingerprint}`) {
    blockers.push("topic_weight_update_authorization_confirmation_invalid");
  }
}

export function assessAccountTopicWeightUpdateSaveRequest({
  authorizationPreview,
  executeRequested = false,
  confirmation = null,
  authorizedPreviewFingerprint = null,
} = {}) {
  const blockers = [];
  validateAuthorizationPreview(authorizationPreview, blockers);
  if (executeRequested !== true) blockers.push("account_topic_weight_update_save_not_requested");
  if (confirmation !== authorizationPreview?.requiredConfirmation) blockers.push("account_topic_weight_update_save_confirmation_invalid");
  if (authorizedPreviewFingerprint !== authorizationPreview?.weightUpdateAuthorizationPreviewFingerprint) {
    blockers.push("account_topic_weight_update_save_fingerprint_mismatch");
  }
  return safeResult({
    status: blockers.length ? "account_topic_weight_update_save_blocked" : "account_topic_weight_update_save_authorized",
    blockers: [...new Set(blockers)],
    eligible: blockers.length === 0,
    authorizedPreviewFingerprint: blockers.length ? null : authorizedPreviewFingerprint,
  });
}

function timestampFrom(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("account_topic_weight_update_timestamp_invalid");
  return date.toISOString();
}

function receiptId(preview) {
  return `atwu_${preview.weightUpdateAuthorizationPreviewFingerprint}`;
}

function idempotencyKey(preview) {
  return `account-topic-weight-update:${preview.weightUpdateAuthorizationPreviewFingerprint}`;
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

function itemMatches(row, target, expectedReceiptId) {
  return row?.receipt_id === expectedReceiptId
    && row?.scope === target.scope
    && row?.weight_key === target.id
    && Number(row?.previous_weight) === target.currentWeight
    && Number(row?.applied_weight) === target.suggestedWeight
    && Number(row?.delta) === target.delta
    && Number(row?.source_unique_idea_count) === target.sourceUniqueIdeaCount
    && Number(row?.source_mean_signal) === target.sourceMeanSignal;
}

function valueMatches(row, target, preview, expectedReceiptId, expectedWeight) {
  return row?.profile_id === preview.profileId
    && row?.scope === target.scope
    && row?.weight_key === target.id
    && Number(row?.weight) === expectedWeight
    && (expectedWeight === target.currentWeight || row?.source_update_receipt_id === expectedReceiptId);
}

export function createAccountTopicWeightStore(d1, { now = () => new Date() } = {}) {
  if (!d1 || typeof d1.prepare !== "function" || typeof d1.batch !== "function") throw new Error("d1_binding_required");

  return {
    async save(input = {}) {
      const gate = assessAccountTopicWeightUpdateSaveRequest(input);
      if (!gate.eligible) return gate;
      const preview = input.authorizationPreview;
      const targets = preview.updateTargets;
      const expectedReceiptId = receiptId(preview);
      const expectedIdempotencyKey = idempotencyKey(preview);
      const existingReceipt = await d1.prepare(INSPECT_ACCOUNT_TOPIC_WEIGHT_UPDATE_SQL)
        .bind(preview.weightUpdateAuthorizationPreviewFingerprint).first();
      const existingValues = await Promise.all(targets.map((target) => d1.prepare(INSPECT_ACCOUNT_TOPIC_WEIGHT_VALUE_SQL)
        .bind(preview.profileId, target.scope, target.id).first()));

      if (existingReceipt) {
        const existingItems = await Promise.all(targets.map((target) => d1.prepare(INSPECT_ACCOUNT_TOPIC_WEIGHT_ITEM_SQL)
          .bind(expectedReceiptId, target.scope, target.id).first()));
        const complete = existingReceipt.id === expectedReceiptId
          && existingReceipt.profile_id === preview.profileId
          && existingReceipt.source_review_fingerprint === preview.sourceReviewFingerprint
          && existingReceipt.authorization_preview_fingerprint === preview.weightUpdateAuthorizationPreviewFingerprint
          && existingReceipt.idempotency_key === expectedIdempotencyKey
          && existingReceipt.status === "active"
          && Number(existingReceipt.item_count) === targets.length
          && existingItems.every((row, index) => itemMatches(row, targets[index], expectedReceiptId))
          && existingValues.every((row, index) => valueMatches(row, targets[index], preview, expectedReceiptId, targets[index].suggestedWeight));
        if (!complete) return safeResult({
          status: "account_topic_weight_update_existing_record_conflict",
          blockers: ["account_topic_weight_update_existing_record_conflict"],
        });
        return safeResult({
          status: "account_topic_weight_update_already_persisted",
          eligible: true,
          alreadyPersisted: true,
          receiptId: expectedReceiptId,
          baselineWeightsVerified: true,
        });
      }

      if (!existingValues.every((row, index) => valueMatches(row, targets[index], preview, expectedReceiptId, targets[index].currentWeight))) {
        return safeResult({
          status: "account_topic_weight_update_baseline_mismatch",
          blockers: ["account_topic_weight_update_baseline_mismatch"],
        });
      }

      let timestamp;
      try {
        timestamp = timestampFrom(now);
      } catch {
        return safeResult({ blockers: ["account_topic_weight_update_timestamp_invalid"] });
      }
      const statements = [d1.prepare(INSERT_UPDATE_RECEIPT_SQL).bind(
        expectedReceiptId,
        preview.profileId,
        preview.sourceReviewFingerprint,
        preview.weightUpdateAuthorizationPreviewFingerprint,
        expectedIdempotencyKey,
        timestamp,
      )];
      for (const target of targets) {
        statements.push(d1.prepare(INSERT_GUARDED_UPDATE_ITEM_SQL).bind(
          expectedReceiptId,
          target.scope,
          target.id,
          preview.profileId,
          target.scope,
          target.id,
          target.currentWeight,
          target.suggestedWeight,
          target.delta,
          target.sourceUniqueIdeaCount,
          target.sourceMeanSignal,
          timestamp,
        ));
        statements.push(d1.prepare(UPDATE_ACCOUNT_TOPIC_WEIGHT_SQL).bind(
          target.suggestedWeight,
          expectedReceiptId,
          timestamp,
          preview.profileId,
          target.scope,
          target.id,
          target.currentWeight,
        ));
      }

      try {
        const results = await d1.batch(statements);
        const succeeded = Array.isArray(results)
          && results.length === statements.length
          && results.every((result) => result?.success === true && changes(result) === 1);
        if (!succeeded) return safeResult({
          status: "account_topic_weight_update_atomic_batch_failed",
          blockers: ["account_topic_weight_update_atomic_batch_failed"],
          databaseWriteAttempted: true,
          baselineWeightsVerified: true,
        });
      } catch {
        return safeResult({
          status: "account_topic_weight_update_atomic_batch_failed",
          blockers: ["account_topic_weight_update_atomic_batch_failed"],
          databaseWriteAttempted: true,
          baselineWeightsVerified: true,
        });
      }

      return safeResult({
        status: "account_topic_weight_update_persisted_in_isolated_store",
        eligible: true,
        persisted: true,
        receiptId: expectedReceiptId,
        updateReceiptCreated: true,
        updateItemsCreated: targets.length,
        weightValuesChanged: targets.length,
        databaseWriteAttempted: true,
        databaseWrites: true,
        baselineWeightsVerified: true,
      });
    },
  };
}
