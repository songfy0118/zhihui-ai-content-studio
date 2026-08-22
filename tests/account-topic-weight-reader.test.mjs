import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACCOUNT_TOPIC_WEIGHT_PROJECTION_COLUMNS,
  buildAccountTopicWeightReadSql,
  readAccountTopicWeightProjection,
} from "../db/account-topic-weight-reader.mjs";

function weightRow(scope, id) {
  const authorizationPreviewFingerprint = scope === "category" ? "a".repeat(64) : "b".repeat(64);
  const current = scope === "category" ? 1 : 0.9;
  const delta = scope === "category" ? 0.012 : 0.008;
  const timestamp = "2026-08-22T14:30:00.000Z";
  return {
    profile_id: "zhihui-ai-tech-finance-v1",
    scope,
    weight_key: id,
    weight: Number((current + delta).toFixed(4)),
    source_update_receipt_id: `atwu_${authorizationPreviewFingerprint}`,
    updated_at: timestamp,
    source_review_fingerprint: scope === "category" ? "c".repeat(64) : "d".repeat(64),
    authorization_preview_fingerprint: authorizationPreviewFingerprint,
    idempotency_key: `account-topic-weight-update:${authorizationPreviewFingerprint}`,
    receipt_status: "active",
    receipt_created_at: timestamp,
    previous_weight: current,
    applied_weight: Number((current + delta).toFixed(4)),
    delta,
    source_unique_idea_count: 3,
    source_mean_signal: scope === "category" ? 0.8 : 0.7,
    item_created_at: timestamp,
  };
}

function fakeD1(rows, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push({ sql, params: [] });
      return {
        bind(...params) {
          calls.at(-1).params = params;
          return this;
        },
        async all() {
          if (fail) throw new Error("injected_read_failure");
          return { results: rows };
        },
      };
    },
  };
}

const profileId = "zhihui-ai-tech-finance-v1";
const requests = [{ scope: "category", id: "ai" }, { scope: "topic", id: "technology" }];

test("reads complete receipt-backed weights in requested order", async () => {
  const category = weightRow("category", "ai");
  const topic = weightRow("topic", "technology");
  const d1 = fakeD1([topic, category]);
  const result = await readAccountTopicWeightProjection(d1, { profileId, weights: requests });

  assert.equal(result.status, "account_topic_weight_projection_ready");
  assert.equal(result.complete, true);
  assert.equal(result.weightCount, 2);
  assert.deepEqual(result.weights.map(({ scope, id }) => ({ scope, id })), requests);
  assert.ok(result.weights.every(({ integrityStatus }) => integrityStatus === "complete_active_update_receipt_read_only"));
  assert.equal(result.eligibleForRankingWeightInput, true);
  assert.equal(result.rankingWeightsApplied, false);
  assert.equal(result.learningWeightsUpdated, false);
  assert.deepEqual(d1.calls[0].params, [profileId, "category", "ai", "topic", "technology"]);
});

test("fails closed for missing or unexpected rows without partial weights", async () => {
  const category = weightRow("category", "ai");
  const topic = weightRow("topic", "technology");
  const missing = await readAccountTopicWeightProjection(fakeD1([category]), { profileId, weights: requests });
  const extra = await readAccountTopicWeightProjection(fakeD1([category, topic]), {
    profileId,
    weights: [requests[0]],
  });

  assert.deepEqual(missing.blockers, ["account_topic_weight_projection_incomplete_or_invalid"]);
  assert.deepEqual(extra.blockers, ["account_topic_weight_projection_incomplete_or_invalid"]);
  assert.equal(missing.weightCount, 0);
  assert.deepEqual(missing.weights, []);
  assert.equal(extra.eligibleForRankingWeightInput, false);
});

test("rejects broken receipt linkage, weight math and failed reads", async () => {
  const brokenLink = weightRow("category", "ai");
  brokenLink.source_update_receipt_id = `atwu_${"f".repeat(64)}`;
  const brokenMath = weightRow("topic", "technology");
  brokenMath.applied_weight += 0.01;
  const linkResult = await readAccountTopicWeightProjection(fakeD1([brokenLink]), { profileId, weights: [requests[0]] });
  const mathResult = await readAccountTopicWeightProjection(fakeD1([brokenMath]), { profileId, weights: [requests[1]] });
  const failed = await readAccountTopicWeightProjection(fakeD1([], { fail: true }), { profileId, weights: [requests[0]] });

  assert.deepEqual(linkResult.blockers, ["account_topic_weight_projection_incomplete_or_invalid"]);
  assert.deepEqual(mathResult.blockers, ["account_topic_weight_projection_incomplete_or_invalid"]);
  assert.deepEqual(failed.blockers, ["account_topic_weight_projection_read_failed"]);
  assert.ok([linkResult, mathResult, failed].every(({ weights }) => weights.length === 0));
});

test("blocks invalid or duplicate requests before querying", async () => {
  const d1 = fakeD1([]);
  const invalidProfile = await readAccountTopicWeightProjection(d1, { profileId: "bad profile", weights: [requests[0]] });
  const duplicate = await readAccountTopicWeightProjection(d1, { profileId, weights: [requests[0], requests[0]] });
  const extraKey = await readAccountTopicWeightProjection(d1, {
    profileId,
    weights: [{ ...requests[0], unexpected: true }],
  });

  assert.deepEqual(invalidProfile.blockers, ["account_topic_weight_projection_request_invalid"]);
  assert.deepEqual(duplicate.blockers, ["account_topic_weight_projection_request_invalid"]);
  assert.deepEqual(extraKey.blockers, ["account_topic_weight_projection_request_invalid"]);
  assert.equal(d1.calls.length, 0);
});

test("uses SELECT-only access and remains disconnected from ranking routes and live D1", async () => {
  const [rankedRoute, metricsRoute, source] = await Promise.all([
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/account-topic-weight-reader.mjs", import.meta.url), "utf8"),
  ]);
  const sql = buildAccountTopicWeightReadSql(2);

  assert.equal(ACCOUNT_TOPIC_WEIGHT_PROJECTION_COLUMNS.length, 17);
  assert.match(sql, /^SELECT\s/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i);
  assert.ok([rankedRoute, metricsRoute].every((content) => !content.includes("account-topic-weight-reader")));
  assert.doesNotMatch(source, /\bgetDb\b|\bfetch\s*\(/);
});
