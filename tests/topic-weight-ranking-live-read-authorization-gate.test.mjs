import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fingerprintTopicWeightRankingLiveReadAuthorizationPreview,
} from "../bridge/topic-weight-ranking-live-read-authorization-preview.mjs";
import {
  assessTopicWeightRankingLiveReadAuthorization,
} from "../bridge/topic-weight-ranking-live-read-authorization-gate.mjs";

const AUTHORIZED_AT = "2026-08-23T02:45:00.000Z";

function query(step, statement, params = [], inspectsDataRows = false) {
  return { step, statement, params, inspectsDataRows };
}

function readyPreview() {
  const authorizationScope = {
    targetBinding: "DB",
    accessMode: "read_only",
    purpose: "inspect_account_topic_weight_schema_and_receipt_backed_values",
    queryWhitelist: [
      query("inspect_expected_schema_objects", "SELECT name, type FROM sqlite_schema", []),
      query("inspect_columns_items", "PRAGMA table_info(`account_topic_weight_update_items`)", []),
      query("inspect_columns_receipts", "PRAGMA table_info(`account_topic_weight_update_receipts`)", []),
      query("inspect_columns_values", "PRAGMA table_info(`account_topic_weight_values`)", []),
      query(
        "read_receipt_backed_weight_projection",
        "SELECT v.profile_id FROM account_topic_weight_values v WHERE v.profile_id = ?",
        ["zhihui-ai-tech-finance-v1", "category", "technology", "topic", "technology"],
        true,
      ),
    ],
    queryCount: 5,
    requestedWeights: [
      { scope: "category", id: "technology" },
      { scope: "topic", id: "technology" },
    ],
    oneTimeExecution: true,
    validityMinutes: 15,
    resultPersistence: "none",
    rankingMutation: "forbidden",
  };
  const zeroWriteGuarantees = {
    selectOrPragmaOnly: true,
    databaseWritesForbidden: true,
    configurationWritesForbidden: true,
    resultPersistenceForbidden: true,
    rankingChangesForbidden: true,
    platformActionsForbidden: true,
  };
  const value = {
    status: "topic_weight_ranking_live_read_authorization_preview_ready",
    blockers: [],
    profileId: "zhihui-ai-tech-finance-v1",
    sourceLiveReadPlanFingerprint: "a".repeat(64),
    sourceReadEvidenceReviewFingerprint: "b".repeat(64),
    authorizationScope,
    zeroWriteGuarantees,
    authorizationRequired: true,
    authorizationGranted: false,
    authorizationReceiptCreated: false,
    authorizationValidityMinutes: 15,
    maximumExecutionCount: 1,
    existingBindingRequired: true,
    credentialsRequested: false,
    permissionExpansionRequested: false,
    liveReadImplemented: false,
    liveReadPerformed: false,
    resultPersistenceAllowed: false,
    eligibleForRankingActivation: false,
    rankingActivationAuthorizationGranted: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
  const liveReadAuthorizationPreviewFingerprint =
    fingerprintTopicWeightRankingLiveReadAuthorizationPreview(value);
  return {
    ...value,
    liveReadAuthorizationPreviewFingerprint,
    requiredUserConfirmation:
      `AUTHORIZE ONE LIVE D1 TOPIC WEIGHT READ ${liveReadAuthorizationPreviewFingerprint}`,
  };
}

function authorize(preview, overrides = {}) {
  return assessTopicWeightRankingLiveReadAuthorization({
    preview,
    authorizeRequested: true,
    confirmation: preview.requiredUserConfirmation,
    authorizedPreviewFingerprint: preview.liveReadAuthorizationPreviewFingerprint,
    authorizationRecordedAt: AUTHORIZED_AT,
    ...overrides,
  });
}

test("creates a deterministic one-time read-only execution contract after exact authorization", () => {
  const preview = readyPreview();
  const first = authorize(preview);
  const repeat = authorize(structuredClone(preview));

  assert.equal(first.status, "topic_weight_ranking_live_read_authorization_accepted");
  assert.equal(first.authorizationAccepted, true);
  assert.equal(first.liveD1ReadAuthorizationGranted, true);
  assert.equal(first.executionContractCreated, true);
  assert.equal(first.executionContract.status, "authorized_not_executed");
  assert.equal(first.executionContract.contractFingerprint, repeat.executionContract.contractFingerprint);
  assert.equal(first.executionContract.maximumExecutionCount, 1);
  assert.equal(first.liveReadPerformed, false);
});

test("binds the exact whitelist and a fifteen-minute non-persistent window", () => {
  const preview = readyPreview();
  const result = authorize(preview);

  assert.equal(result.authorizationRecordedAt, AUTHORIZED_AT);
  assert.equal(result.authorizationExpiresAt, "2026-08-23T03:00:00.000Z");
  assert.deepEqual(result.executionContract.queryWhitelist, preview.authorizationScope.queryWhitelist);
  assert.deepEqual(result.executionContract.requestedWeights, preview.authorizationScope.requestedWeights);
  assert.equal(result.executionContract.targetBinding, "DB");
  assert.equal(result.executionContract.constraints.resultPersistenceAllowed, false);
  assert.equal(result.executionContract.constraints.rankingChangesAllowed, false);
});

test("blocks missing intent, wrong confirmation, stale fingerprints and invalid time", () => {
  const preview = readyPreview();
  const missing = authorize(preview, { authorizeRequested: false });
  const wrong = authorize(preview, { confirmation: "AUTHORIZE SOMETHING ELSE" });
  const stale = authorize(preview, { authorizedPreviewFingerprint: "f".repeat(64) });
  const badTime = authorize(preview, { authorizationRecordedAt: "2026-08-23" });

  assert.ok(missing.blockers.includes("topic_weight_ranking_live_read_authorization_not_requested"));
  assert.ok(wrong.blockers.includes("topic_weight_ranking_live_read_authorization_confirmation_invalid"));
  assert.ok(stale.blockers.includes("topic_weight_ranking_live_read_authorization_fingerprint_mismatch"));
  assert.ok(badTime.blockers.includes("topic_weight_ranking_live_read_authorization_timestamp_invalid"));
  assert.ok([missing, wrong, stale, badTime].every(({ executionContract }) => executionContract === null));
});

test("rejects a tampered preview and any mutating SQL before creating a contract", () => {
  const fingerprintTampered = readyPreview();
  fingerprintTampered.authorizationScope.validityMinutes = 60;
  const changedScope = authorize(fingerprintTampered);

  const sqlTampered = readyPreview();
  sqlTampered.authorizationScope.queryWhitelist[0].statement = "DELETE FROM account_topic_weight_values";
  sqlTampered.liveReadAuthorizationPreviewFingerprint =
    fingerprintTopicWeightRankingLiveReadAuthorizationPreview(sqlTampered);
  sqlTampered.requiredUserConfirmation =
    `AUTHORIZE ONE LIVE D1 TOPIC WEIGHT READ ${sqlTampered.liveReadAuthorizationPreviewFingerprint}`;
  const changedSql = authorize(sqlTampered);

  assert.ok(changedScope.blockers.includes("topic_weight_ranking_live_read_authorization_preview_invalid_or_tampered"));
  assert.ok(changedSql.blockers.includes("topic_weight_ranking_live_read_authorization_preview_invalid_or_tampered"));
  assert.equal(changedScope.liveD1ReadAuthorizationGranted, false);
  assert.equal(changedSql.readAllowedByContract, false);
});

test("rejects forged profile, source fingerprints and duplicate weight keys", () => {
  const forged = readyPreview();
  forged.profileId = "../other-profile";
  forged.sourceLiveReadPlanFingerprint = "not-a-hash";
  forged.authorizationScope.requestedWeights[1] = { scope: "category", id: "technology" };
  forged.liveReadAuthorizationPreviewFingerprint =
    fingerprintTopicWeightRankingLiveReadAuthorizationPreview(forged);
  forged.requiredUserConfirmation =
    `AUTHORIZE ONE LIVE D1 TOPIC WEIGHT READ ${forged.liveReadAuthorizationPreviewFingerprint}`;

  const result = authorize(forged);
  assert.ok(result.blockers.includes("topic_weight_ranking_live_read_authorization_preview_invalid_or_tampered"));
  assert.equal(result.executionContract, null);
  assert.equal(result.liveD1ReadAuthorizationGranted, false);
});

test("gate performs no D1, credential, persistence, ranking or publication action", async () => {
  const result = authorize(readyPreview());
  const [source, route, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-live-read-authorization-gate.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(result.authorizationPersisted, false);
  assert.equal(result.liveReadImplemented, false);
  assert.equal(result.liveReadPerformed, false);
  assert.equal(result.queryExecutionCount, 0);
  assert.equal(result.inspectedDataRows, false);
  assert.equal(result.credentialsRequested, false);
  assert.equal(result.permissionExpansionRequested, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /process\.env|\.prepare\s*\(|\bfetch\s*\(|writeFile|appendFile|mkdir|api[_-]?key|token|password|secret/i);
  assert.ok([route, page].every((content) => !content.includes("topic-weight-ranking-live-read-authorization-gate")));
});
