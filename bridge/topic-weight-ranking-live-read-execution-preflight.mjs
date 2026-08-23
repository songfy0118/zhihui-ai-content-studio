import {
  fingerprintTopicWeightRankingLiveReadExecutionContract,
} from "./topic-weight-ranking-live-read-authorization-gate.mjs";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MUTATING_SQL = /\b(?:ALTER|CREATE|DELETE|DROP|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;
const MAX_CLOCK_LENGTH = 40;
const VALIDITY_MS = 15 * 60_000;
const EXPECTED_CONSTRAINTS = Object.freeze({
  existingBindingOnly: true,
  credentialsAllowed: false,
  permissionExpansionAllowed: false,
  selectOrPragmaOnly: true,
  databaseWritesAllowed: false,
  configurationWritesAllowed: false,
  resultPersistenceAllowed: false,
  rankingChangesAllowed: false,
  platformActionsAllowed: false,
});

function safeTimestamp(value) {
  if (typeof value !== "string" || value.length < 20 || value.length > MAX_CLOCK_LENGTH) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) return null;
  return timestamp;
}

function validAuthorization(value) {
  const contract = value?.executionContract;
  const authorizedAt = safeTimestamp(value?.authorizationRecordedAt);
  const expiresAt = safeTimestamp(value?.authorizationExpiresAt);
  if (
    value?.status !== "topic_weight_ranking_live_read_authorization_accepted"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || value?.authorizationAccepted !== true
    || !HASH.test(value?.authorizedPreviewFingerprint ?? "")
    || value?.executionContractCreated !== true
    || value?.readAllowedByContract !== true
    || value?.liveD1ReadAuthorizationGranted !== true
    || value?.authorizationPersisted !== false
    || value?.liveReadImplemented !== false
    || value?.liveReadPerformed !== false
    || value?.queryExecutionCount !== 0
    || value?.inspectedDataRows !== false
    || value?.resultPersistenceAllowed !== false
    || value?.eligibleForRankingActivation !== false
    || value?.rankingActivationAuthorizationGranted !== false
    || value?.rankingWeightsApplied !== false
    || value?.learningWeightsUpdated !== false
    || value?.credentialsRequested !== false
    || value?.permissionExpansionRequested !== false
    || value?.databaseWrites !== false
    || value?.configurationWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
    || authorizedAt === null
    || expiresAt === null
    || expiresAt - authorizedAt !== VALIDITY_MS
    || contract?.status !== "authorized_not_executed"
    || !HASH.test(contract?.contractFingerprint ?? "")
    || contract.contractFingerprint !== fingerprintTopicWeightRankingLiveReadExecutionContract(contract)
    || !SAFE_ID.test(contract?.profileId ?? "")
    || !HASH.test(contract?.sourceLiveReadPlanFingerprint ?? "")
    || !HASH.test(contract?.sourceReadEvidenceReviewFingerprint ?? "")
    || contract?.authorizationPreviewFingerprint !== value.authorizedPreviewFingerprint
    || contract?.authorizationRecordedAt !== value.authorizationRecordedAt
    || contract?.authorizationExpiresAt !== value.authorizationExpiresAt
    || contract?.targetBinding !== "DB"
    || contract?.operation !== "execute_exact_read_only_query_whitelist_once"
    || contract?.maximumExecutionCount !== 1
    || JSON.stringify(contract?.constraints) !== JSON.stringify(EXPECTED_CONSTRAINTS)
    || !Array.isArray(contract?.queryWhitelist)
    || contract.queryWhitelist.length !== 5
    || contract.queryWhitelist.filter(({ inspectsDataRows }) => inspectsDataRows === true).length !== 1
    || !Array.isArray(contract?.requestedWeights)
    || contract.requestedWeights.length < 1
    || contract.requestedWeights.length > 20
  ) return null;

  const querySteps = new Set();
  if (!contract.queryWhitelist.every(({ step, statement, params }) => {
    if (!SAFE_ID.test(step ?? "") || querySteps.has(step)) return false;
    querySteps.add(step);
    return typeof statement === "string"
      && /^\s*(?:SELECT|PRAGMA)\b/i.test(statement)
      && !MUTATING_SQL.test(statement)
      && Array.isArray(params)
      && params.every((param) => typeof param === "string");
  })) return null;

  const weightIdentities = new Set();
  if (!contract.requestedWeights.every(({ scope, id }) => {
    const identity = `${scope}:${id}`;
    const valid = ["category", "topic"].includes(scope)
      && SAFE_ID.test(id ?? "")
      && !weightIdentities.has(identity);
    weightIdentities.add(identity);
    return valid;
  })) return null;
  return { authorizedAt, contract, expiresAt };
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_live_read_execution_preflight_blocked",
    blockers: [],
    checkedAt: null,
    sourceAuthorizationPreviewFingerprint: null,
    sourceExecutionContractFingerprint: null,
    authorizationRecordedAt: null,
    authorizationExpiresAt: null,
    millisecondsUntilExpiry: 0,
    authorizedQueryCount: 0,
    remainingExecutionCount: 0,
    authorizationWindowValid: false,
    eligibleForSingleReadAdapterHandoff: false,
    readyForSingleLiveReadInvocation: false,
    authorizationConsumed: false,
    authorizationPersisted: false,
    liveReadAdapterImplemented: false,
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

export function preflightTopicWeightRankingLiveReadExecution({
  authorization,
  preflightRequested = false,
  checkedAt = null,
  observedExecutionCount = 0,
} = {}) {
  const blockers = [];
  const validated = validAuthorization(authorization);
  if (!validated) blockers.push("topic_weight_ranking_live_read_authorization_invalid_or_tampered");
  if (preflightRequested !== true) blockers.push("topic_weight_ranking_live_read_execution_preflight_not_requested");
  const checkedTimestamp = safeTimestamp(checkedAt);
  if (checkedTimestamp === null) blockers.push("topic_weight_ranking_live_read_execution_preflight_timestamp_invalid");
  if (!Number.isInteger(observedExecutionCount) || observedExecutionCount < 0) {
    blockers.push("topic_weight_ranking_live_read_execution_count_invalid");
  } else if (observedExecutionCount !== 0) {
    blockers.push("topic_weight_ranking_live_read_authorization_already_consumed");
  }
  if (validated && checkedTimestamp !== null) {
    if (checkedTimestamp < validated.authorizedAt) {
      blockers.push("topic_weight_ranking_live_read_authorization_not_yet_valid");
    }
    if (checkedTimestamp >= validated.expiresAt) {
      blockers.push("topic_weight_ranking_live_read_authorization_expired");
    }
  }
  if (blockers.length || !validated || checkedTimestamp === null) {
    return safeResult({ blockers: [...new Set(blockers)] });
  }

  return safeResult({
    status: "topic_weight_ranking_live_read_execution_preflight_ready",
    checkedAt,
    sourceAuthorizationPreviewFingerprint: authorization.authorizedPreviewFingerprint,
    sourceExecutionContractFingerprint: validated.contract.contractFingerprint,
    authorizationRecordedAt: authorization.authorizationRecordedAt,
    authorizationExpiresAt: authorization.authorizationExpiresAt,
    millisecondsUntilExpiry: validated.expiresAt - checkedTimestamp,
    authorizedQueryCount: validated.contract.queryWhitelist.length,
    remainingExecutionCount: 1,
    authorizationWindowValid: true,
    eligibleForSingleReadAdapterHandoff: true,
  });
}
