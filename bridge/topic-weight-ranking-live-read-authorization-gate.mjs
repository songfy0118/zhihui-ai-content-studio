import { createHash } from "node:crypto";

import {
  fingerprintTopicWeightRankingLiveReadAuthorizationPreview,
} from "./topic-weight-ranking-live-read-authorization-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MUTATING_SQL = /\b(?:ALTER|CREATE|DELETE|DROP|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;
const MAX_CLOCK_LENGTH = 40;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function contractFingerprintPayload(value) {
  return {
    profileId: value.profileId,
    sourceLiveReadPlanFingerprint: value.sourceLiveReadPlanFingerprint,
    sourceReadEvidenceReviewFingerprint: value.sourceReadEvidenceReviewFingerprint,
    authorizationPreviewFingerprint: value.authorizationPreviewFingerprint,
    authorizationRecordedAt: value.authorizationRecordedAt,
    authorizationExpiresAt: value.authorizationExpiresAt,
    targetBinding: value.targetBinding,
    operation: value.operation,
    queryWhitelist: value.queryWhitelist,
    requestedWeights: value.requestedWeights,
    maximumExecutionCount: value.maximumExecutionCount,
    constraints: value.constraints,
  };
}

export function fingerprintTopicWeightRankingLiveReadExecutionContract(value) {
  return hash(contractFingerprintPayload(value));
}

function safeTimestamp(value) {
  if (typeof value !== "string" || value.length < 20 || value.length > MAX_CLOCK_LENGTH) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) return null;
  return timestamp;
}

function validPreview(value) {
  if (
    value?.status !== "topic_weight_ranking_live_read_authorization_preview_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !SAFE_ID.test(value?.profileId ?? "")
    || !HASH.test(value?.sourceLiveReadPlanFingerprint ?? "")
    || !HASH.test(value?.sourceReadEvidenceReviewFingerprint ?? "")
    || !HASH.test(value?.liveReadAuthorizationPreviewFingerprint ?? "")
    || value.liveReadAuthorizationPreviewFingerprint
      !== fingerprintTopicWeightRankingLiveReadAuthorizationPreview(value)
    || value?.requiredUserConfirmation
      !== `AUTHORIZE ONE LIVE D1 TOPIC WEIGHT READ ${value.liveReadAuthorizationPreviewFingerprint}`
    || value?.authorizationScope?.targetBinding !== "DB"
    || value?.authorizationScope?.accessMode !== "read_only"
    || value?.authorizationScope?.purpose !== "inspect_account_topic_weight_schema_and_receipt_backed_values"
    || value?.authorizationScope?.queryCount !== 5
    || !Array.isArray(value?.authorizationScope?.queryWhitelist)
    || value.authorizationScope.queryWhitelist.length !== 5
    || value.authorizationScope.queryWhitelist.filter(({ inspectsDataRows }) => inspectsDataRows === true).length !== 1
    || !Array.isArray(value?.authorizationScope?.requestedWeights)
    || value.authorizationScope.requestedWeights.length < 1
    || value.authorizationScope.requestedWeights.length > 20
    || value.authorizationScope.oneTimeExecution !== true
    || value.authorizationScope.validityMinutes !== 15
    || value.authorizationScope.resultPersistence !== "none"
    || value.authorizationScope.rankingMutation !== "forbidden"
    || value?.zeroWriteGuarantees?.selectOrPragmaOnly !== true
    || value.zeroWriteGuarantees.databaseWritesForbidden !== true
    || value.zeroWriteGuarantees.configurationWritesForbidden !== true
    || value.zeroWriteGuarantees.resultPersistenceForbidden !== true
    || value.zeroWriteGuarantees.rankingChangesForbidden !== true
    || value.zeroWriteGuarantees.platformActionsForbidden !== true
    || value?.authorizationRequired !== true
    || value?.authorizationGranted !== false
    || value?.authorizationReceiptCreated !== false
    || value?.authorizationValidityMinutes !== 15
    || value?.maximumExecutionCount !== 1
    || value?.existingBindingRequired !== true
    || value?.credentialsRequested !== false
    || value?.permissionExpansionRequested !== false
    || value?.liveReadImplemented !== false
    || value?.liveReadPerformed !== false
    || value?.resultPersistenceAllowed !== false
    || value?.eligibleForRankingActivation !== false
    || value?.rankingActivationAuthorizationGranted !== false
    || value?.rankingWeightsApplied !== false
    || value?.learningWeightsUpdated !== false
    || value?.databaseWrites !== false
    || value?.configurationWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return false;

  const querySteps = new Set();
  const validQueries = value.authorizationScope.queryWhitelist.every(({ step, statement, params }) => {
    if (!SAFE_ID.test(step ?? "") || querySteps.has(step)) return false;
    querySteps.add(step);
    return typeof statement === "string"
      && /^\s*(?:SELECT|PRAGMA)\b/i.test(statement)
      && !MUTATING_SQL.test(statement)
      && Array.isArray(params)
      && params.every((param) => typeof param === "string");
  });
  if (!validQueries) return false;

  const weightIdentities = new Set();
  return value.authorizationScope.requestedWeights.every(({ scope, id }) => {
    const identity = `${scope}:${id}`;
    const valid = ["category", "topic"].includes(scope)
      && SAFE_ID.test(id ?? "")
      && !weightIdentities.has(identity);
    weightIdentities.add(identity);
    return valid;
  });
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_live_read_authorization_blocked",
    blockers: [],
    authorizationAccepted: false,
    authorizedPreviewFingerprint: null,
    authorizationRecordedAt: null,
    authorizationExpiresAt: null,
    executionContract: null,
    executionContractCreated: false,
    readAllowedByContract: false,
    liveD1ReadAuthorizationGranted: false,
    authorizationPersisted: false,
    liveReadImplemented: false,
    liveReadPerformed: false,
    queryExecutionCount: 0,
    inspectedDataRows: false,
    resultPersistenceAllowed: false,
    eligibleForRankingActivation: false,
    rankingActivationAuthorizationGranted: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    credentialsRequested: false,
    permissionExpansionRequested: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function assessTopicWeightRankingLiveReadAuthorization({
  preview,
  authorizeRequested = false,
  confirmation = null,
  authorizedPreviewFingerprint = null,
  authorizationRecordedAt = null,
} = {}) {
  const blockers = [];
  if (!validPreview(preview)) {
    blockers.push("topic_weight_ranking_live_read_authorization_preview_invalid_or_tampered");
  }
  if (authorizeRequested !== true) blockers.push("topic_weight_ranking_live_read_authorization_not_requested");
  if (confirmation !== preview?.requiredUserConfirmation) {
    blockers.push("topic_weight_ranking_live_read_authorization_confirmation_invalid");
  }
  if (authorizedPreviewFingerprint !== preview?.liveReadAuthorizationPreviewFingerprint) {
    blockers.push("topic_weight_ranking_live_read_authorization_fingerprint_mismatch");
  }
  const authorizedAt = safeTimestamp(authorizationRecordedAt);
  if (authorizedAt === null) blockers.push("topic_weight_ranking_live_read_authorization_timestamp_invalid");
  if (blockers.length || authorizedAt === null) return safeResult({ blockers: [...new Set(blockers)] });

  const authorizationExpiresAt = new Date(
    authorizedAt + preview.authorizationValidityMinutes * 60_000,
  ).toISOString();
  const contractPayload = {
    profileId: preview.profileId,
    sourceLiveReadPlanFingerprint: preview.sourceLiveReadPlanFingerprint,
    sourceReadEvidenceReviewFingerprint: preview.sourceReadEvidenceReviewFingerprint,
    authorizationPreviewFingerprint: preview.liveReadAuthorizationPreviewFingerprint,
    authorizationRecordedAt,
    authorizationExpiresAt,
    targetBinding: preview.authorizationScope.targetBinding,
    operation: "execute_exact_read_only_query_whitelist_once",
    queryWhitelist: preview.authorizationScope.queryWhitelist.map((query) => ({
      ...query,
      params: [...query.params],
    })),
    requestedWeights: preview.authorizationScope.requestedWeights.map((weight) => ({ ...weight })),
    maximumExecutionCount: preview.maximumExecutionCount,
    constraints: {
      existingBindingOnly: true,
      credentialsAllowed: false,
      permissionExpansionAllowed: false,
      selectOrPragmaOnly: true,
      databaseWritesAllowed: false,
      configurationWritesAllowed: false,
      resultPersistenceAllowed: false,
      rankingChangesAllowed: false,
      platformActionsAllowed: false,
    },
  };
  return safeResult({
    status: "topic_weight_ranking_live_read_authorization_accepted",
    authorizationAccepted: true,
    authorizedPreviewFingerprint: preview.liveReadAuthorizationPreviewFingerprint,
    authorizationRecordedAt,
    authorizationExpiresAt,
    executionContract: {
      ...contractPayload,
      contractFingerprint: fingerprintTopicWeightRankingLiveReadExecutionContract(contractPayload),
      status: "authorized_not_executed",
    },
    executionContractCreated: true,
    readAllowedByContract: true,
    liveD1ReadAuthorizationGranted: true,
  });
}
