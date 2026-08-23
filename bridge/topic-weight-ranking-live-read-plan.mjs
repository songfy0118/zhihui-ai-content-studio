import { createHash } from "node:crypto";

import {
  buildTopicWeightRankingActivationAuthorizationPreview,
} from "./topic-weight-ranking-activation-authorization-preview.mjs";
import { DEFAULT_ACCOUNT_PROFILE } from "./topic-ranking.mjs";
import {
  buildAccountTopicWeightReadSql,
} from "../db/account-topic-weight-reader.mjs";
import {
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS,
  ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL,
} from "../db/account-topic-weight-storage-inspector.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REQUEST_KEYS = Object.freeze(["id", "scope"]);
const MUTATING_SQL = /\b(?:ALTER|CREATE|DELETE|DROP|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function fingerprintTopicWeightRankingLiveReadPlan(plan) {
  return hash({
    profileId: plan.profileId,
    sourceAuthorizationPreviewFingerprint: plan.sourceAuthorizationPreviewFingerprint,
    requestedWeights: plan.requestedWeights,
    requestedBinding: plan.requestedBinding,
    inspectionScope: plan.inspectionScope,
    queries: plan.queries,
  });
}

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify([...keys].sort());
}

function safeRequests(value, profile) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const categoryIds = new Set(Object.keys(profile.categoryWeights ?? {}));
  const topicIds = new Set((profile.topicGroups ?? []).map(({ id }) => id));
  const identities = new Set();
  for (const request of value) {
    const identity = `${request?.scope}:${request?.id}`;
    const mapped = request?.scope === "category"
      ? categoryIds.has(request?.id)
      : request?.scope === "topic" && topicIds.has(request?.id);
    if (
      !exactKeys(request, REQUEST_KEYS)
      || !mapped
      || !SAFE_ID.test(request?.id ?? "")
      || identities.has(identity)
    ) return null;
    identities.add(identity);
  }
  return value.map((request) => ({ ...request }));
}

function readOnlySql(statement) {
  return /^\s*(?:SELECT|PRAGMA)\b/i.test(statement) && !MUTATING_SQL.test(statement);
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_live_read_plan_blocked",
    blockers: [],
    profileId: null,
    sourceAuthorizationPreviewFingerprint: null,
    liveReadPlanFingerprint: null,
    requestedWeights: [],
    requestedWeightCount: 0,
    queries: [],
    queryCount: 0,
    requestedBinding: "DB",
    inspectionScope: "live_d1_read_only",
    readOnlyStatementsOnly: false,
    requiresExistingD1Binding: true,
    permissionExpansionRequested: false,
    credentialsRequested: false,
    executionImplemented: false,
    liveReadPerformed: false,
    inspectedDataRows: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildTopicWeightRankingLiveReadPlan({
  authorizationPreview,
  reviewConfirmation,
  requestedWeights,
  profile = DEFAULT_ACCOUNT_PROFILE,
} = {}) {
  const blockers = [];
  const rebuiltAuthorization = buildTopicWeightRankingActivationAuthorizationPreview(reviewConfirmation);
  const authorizationVerified = rebuiltAuthorization.status
    === "topic_weight_ranking_activation_authorization_preview_ready"
    && JSON.stringify(authorizationPreview) === JSON.stringify(rebuiltAuthorization);
  if (!authorizationVerified) blockers.push("ranking_activation_authorization_preview_invalid_or_tampered");

  const weights = safeRequests(requestedWeights, profile);
  if (!weights) blockers.push("ranking_live_read_weight_requests_invalid_or_unmapped");
  if (authorizationPreview?.profileId !== profile.id) blockers.push("ranking_live_read_profile_mismatch");
  if (blockers.length || !weights) return safeResult({ blockers: [...new Set(blockers)] });

  const schemaQueries = [
    {
      step: "inspect_expected_schema_objects",
      statement: ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL,
      params: [],
      inspectsDataRows: false,
    },
    ...Object.keys(ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS).map((table) => ({
      step: `inspect_columns_${table}`,
      statement: `PRAGMA table_info(\`${table}\`)`,
      params: [],
      inspectsDataRows: false,
    })),
  ];
  const weightQuery = {
    step: "read_receipt_backed_weight_projection",
    statement: buildAccountTopicWeightReadSql(weights.length),
    params: [profile.id, ...weights.flatMap(({ scope, id }) => [scope, id])],
    inspectsDataRows: true,
  };
  const queries = [...schemaQueries, weightQuery];
  const readOnlyStatementsOnly = queries.every(({ statement }) => readOnlySql(statement));
  if (!readOnlyStatementsOnly) return safeResult({ blockers: ["ranking_live_read_plan_contains_non_read_only_sql"] });

  const fingerprintPayload = {
    profileId: profile.id,
    sourceAuthorizationPreviewFingerprint: authorizationPreview.activationAuthorizationPreviewFingerprint,
    requestedWeights: weights,
    requestedBinding: "DB",
    inspectionScope: "live_d1_read_only",
    queries,
  };
  return safeResult({
    status: "topic_weight_ranking_live_read_plan_ready",
    ...fingerprintPayload,
    liveReadPlanFingerprint: fingerprintTopicWeightRankingLiveReadPlan(fingerprintPayload),
    requestedWeightCount: weights.length,
    queryCount: queries.length,
    readOnlyStatementsOnly,
  });
}
