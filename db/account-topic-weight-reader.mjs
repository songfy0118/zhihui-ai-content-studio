const HASH = /^[a-f0-9]{64}$/;
const RECEIPT_ID = /^atwu_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export const ACCOUNT_TOPIC_WEIGHT_PROJECTION_COLUMNS = Object.freeze([
  "profile_id",
  "scope",
  "weight_key",
  "weight",
  "source_update_receipt_id",
  "updated_at",
  "source_review_fingerprint",
  "authorization_preview_fingerprint",
  "idempotency_key",
  "receipt_status",
  "receipt_created_at",
  "previous_weight",
  "applied_weight",
  "delta",
  "source_unique_idea_count",
  "source_mean_signal",
  "item_created_at",
]);

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify([...keys].sort());
}

function strictIso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString() === value ? value : null;
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function normalizeRow(row, requestedProfileId) {
  if (!row || !exactKeys(row, ACCOUNT_TOPIC_WEIGHT_PROJECTION_COLUMNS)) return null;
  const receiptCreatedAt = strictIso(row.receipt_created_at);
  const itemCreatedAt = strictIso(row.item_created_at);
  const updatedAt = strictIso(row.updated_at);
  if (
    row.profile_id !== requestedProfileId
    || !SAFE_ID.test(row.profile_id ?? "")
    || !["category", "topic"].includes(row.scope)
    || !SAFE_ID.test(row.weight_key ?? "")
    || !RECEIPT_ID.test(row.source_update_receipt_id ?? "")
    || !HASH.test(row.source_review_fingerprint ?? "")
    || !HASH.test(row.authorization_preview_fingerprint ?? "")
    || row.source_update_receipt_id !== `atwu_${row.authorization_preview_fingerprint}`
    || row.idempotency_key !== `account-topic-weight-update:${row.authorization_preview_fingerprint}`
    || row.receipt_status !== "active"
    || !receiptCreatedAt
    || !itemCreatedAt
    || !updatedAt
    || receiptCreatedAt !== itemCreatedAt
    || receiptCreatedAt !== updatedAt
    || !Number.isFinite(row.previous_weight)
    || row.previous_weight < 0.5
    || row.previous_weight > 1.5
    || !Number.isFinite(row.applied_weight)
    || row.applied_weight < 0.5
    || row.applied_weight > 1.5
    || !Number.isFinite(row.weight)
    || row.weight !== row.applied_weight
    || !Number.isFinite(row.delta)
    || row.delta === 0
    || Math.abs(row.delta) > 0.05
    || row.applied_weight !== rounded(row.previous_weight + row.delta)
    || !Number.isSafeInteger(row.source_unique_idea_count)
    || row.source_unique_idea_count < 2
    || !Number.isFinite(row.source_mean_signal)
    || row.source_mean_signal < 0
    || row.source_mean_signal > 1
  ) return null;
  return {
    profileId: row.profile_id,
    scope: row.scope,
    id: row.weight_key,
    weight: row.weight,
    previousWeight: row.previous_weight,
    delta: row.delta,
    sourceUniqueIdeaCount: row.source_unique_idea_count,
    sourceMeanSignal: row.source_mean_signal,
    sourceReviewFingerprint: row.source_review_fingerprint,
    authorizationPreviewFingerprint: row.authorization_preview_fingerprint,
    updateReceiptId: row.source_update_receipt_id,
    updatedAt,
    integrityStatus: "complete_active_update_receipt_read_only",
  };
}

function safeResult(fields = {}) {
  return {
    status: "account_topic_weight_projection_blocked",
    blockers: [],
    profileId: null,
    weights: [],
    weightCount: 0,
    complete: false,
    inspectedDataRows: false,
    eligibleForRankingWeightInput: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validRequests(requests) {
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > 20) return false;
  const identities = new Set();
  for (const request of requests) {
    const identity = `${request?.scope}:${request?.id}`;
    if (
      !exactKeys(request, ["id", "scope"])
      || !["category", "topic"].includes(request?.scope)
      || !SAFE_ID.test(request?.id ?? "")
      || identities.has(identity)
    ) return false;
    identities.add(identity);
  }
  return true;
}

export function buildAccountTopicWeightReadSql(requestCount) {
  if (!Number.isSafeInteger(requestCount) || requestCount < 1 || requestCount > 20) throw new Error("account_topic_weight_request_count_invalid");
  const predicates = Array.from({ length: requestCount }, () => "(v.scope = ? AND v.weight_key = ?)").join(" OR ");
  return `SELECT
  v.profile_id, v.scope, v.weight_key, v.weight, v.source_update_receipt_id, v.updated_at,
  r.source_review_fingerprint, r.authorization_preview_fingerprint, r.idempotency_key,
  r.status AS receipt_status, r.created_at AS receipt_created_at,
  i.previous_weight, i.applied_weight, i.delta,
  i.source_unique_idea_count, i.source_mean_signal, i.created_at AS item_created_at
FROM account_topic_weight_values v
JOIN account_topic_weight_update_receipts r ON r.id = v.source_update_receipt_id
JOIN account_topic_weight_update_items i
  ON i.receipt_id = r.id AND i.scope = v.scope AND i.weight_key = v.weight_key
WHERE v.profile_id = ? AND (${predicates})`;
}

export async function readAccountTopicWeightProjection(d1, { profileId = null, weights = [] } = {}) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  if (!SAFE_ID.test(profileId ?? "") || !validRequests(weights)) {
    return safeResult({ blockers: ["account_topic_weight_projection_request_invalid"] });
  }
  const params = [profileId, ...weights.flatMap(({ scope, id }) => [scope, id])];
  let result;
  try {
    result = await d1.prepare(buildAccountTopicWeightReadSql(weights.length)).bind(...params).all();
  } catch {
    return safeResult({ blockers: ["account_topic_weight_projection_read_failed"], inspectedDataRows: true });
  }
  const rows = Array.isArray(result?.results) ? result.results : [];
  const byIdentity = new Map(rows.map((row) => [`${row?.scope}:${row?.weight_key}`, row]));
  const projection = weights.map(({ scope, id }) => normalizeRow(byIdentity.get(`${scope}:${id}`), profileId)).filter(Boolean);
  if (rows.length !== weights.length || byIdentity.size !== weights.length || projection.length !== weights.length) {
    return safeResult({
      blockers: ["account_topic_weight_projection_incomplete_or_invalid"],
      profileId,
      inspectedDataRows: true,
    });
  }
  return safeResult({
    status: "account_topic_weight_projection_ready",
    profileId,
    weights: projection,
    weightCount: projection.length,
    complete: true,
    inspectedDataRows: true,
    eligibleForRankingWeightInput: true,
  });
}
