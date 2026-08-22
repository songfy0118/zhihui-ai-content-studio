import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPlatformTextMetricsReadSql,
  readPlatformTextMetricsProjection,
} from "../db/platform-text-metrics-reader.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function metricRow(platform) {
  const externalPostId = platform === "xiaohongshu" ? "xhs-post-1" : "douyin-post-1";
  const capturedAt = "2026-08-22T12:00:00.000Z";
  const sourceEvidenceFingerprint = platform === "xiaohongshu" ? "5".repeat(64) : "6".repeat(64);
  const id = `metric_${hash({ platform, externalPostId, capturedAt, sourceEvidenceFingerprint })}`;
  return {
    id,
    idea_id: platform === "xiaohongshu" ? "idea-xhs-1" : "idea-douyin-1",
    platform,
    views: platform === "xiaohongshu" ? 120 : 200,
    likes: 20,
    comments: 3,
    shares: 2,
    saves: 8,
    followers: 1,
    completion_rate: 42.5,
    source_kind: platform === "xiaohongshu" ? "platform_export" : "platform_api",
    external_post_id: externalPostId,
    captured_at: capturedAt,
    imported_at: "2026-08-22T12:30:00.000Z",
    content_fingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
    published_post_url: platform === "xiaohongshu"
      ? `https://www.xiaohongshu.com/explore/${externalPostId}`
      : `https://www.douyin.com/video/${externalPostId}`,
    published_at: "2026-08-22T10:00:00.000Z",
    source_reference: platform === "xiaohongshu" ? "xiaohongshu-export-20260822.csv" : "douyin-api-report-20260822.json",
    source_evidence_fingerprint: sourceEvidenceFingerprint,
    created_at: "2026-08-22T13:20:00.000Z",
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

test("reads a complete two-platform strong-source metrics projection in requested order", async () => {
  const rows = [metricRow("douyin"), metricRow("xiaohongshu")];
  const ids = [rows[1].id, rows[0].id];
  const d1 = fakeD1(rows);
  const result = await readPlatformTextMetricsProjection(d1, { metricIds: ids });

  assert.equal(result.status, "platform_text_metrics_projection_ready");
  assert.equal(result.complete, true);
  assert.equal(result.metricCount, 2);
  assert.deepEqual(result.metrics.map(({ metricId }) => metricId), ids);
  assert.ok(result.metrics.every(({ verificationStatus }) => verificationStatus === "strong_source_verified_read_only"));
  assert.equal(result.eligibleForWeightUpdatePreview, true);
  assert.equal(result.learningUpdateEligible, false);
  assert.deepEqual(d1.calls[0].params, ids);
});

test("fails closed when any requested metric is missing or an unexpected row is returned", async () => {
  const xhs = metricRow("xiaohongshu");
  const douyin = metricRow("douyin");
  const missing = await readPlatformTextMetricsProjection(fakeD1([xhs]), { metricIds: [xhs.id, douyin.id] });
  const extra = await readPlatformTextMetricsProjection(fakeD1([xhs, douyin]), { metricIds: [xhs.id] });

  assert.deepEqual(missing.blockers, ["metrics_projection_incomplete_or_invalid"]);
  assert.deepEqual(extra.blockers, ["metrics_projection_incomplete_or_invalid"]);
  assert.equal(missing.metricCount, 0);
  assert.equal(extra.eligibleForWeightUpdatePreview, false);
});

test("rejects tampered provenance, negative counters and failed reads without partial output", async () => {
  const invalidSource = metricRow("xiaohongshu");
  invalidSource.source_kind = "manual_entry";
  const negative = metricRow("douyin");
  negative.views = -1;
  const sourceResult = await readPlatformTextMetricsProjection(fakeD1([invalidSource]), { metricIds: [invalidSource.id] });
  const counterResult = await readPlatformTextMetricsProjection(fakeD1([negative]), { metricIds: [negative.id] });
  const failed = await readPlatformTextMetricsProjection(fakeD1([], { fail: true }), { metricIds: [metricRow("douyin").id] });

  assert.deepEqual(sourceResult.blockers, ["metrics_projection_incomplete_or_invalid"]);
  assert.deepEqual(counterResult.blockers, ["metrics_projection_incomplete_or_invalid"]);
  assert.deepEqual(failed.blockers, ["metrics_projection_read_failed"]);
  assert.ok([sourceResult, counterResult, failed].every(({ metrics }) => metrics.length === 0));
});

test("blocks invalid or duplicate metric IDs before querying", async () => {
  const d1 = fakeD1([]);
  const validId = metricRow("douyin").id;
  const invalid = await readPlatformTextMetricsProjection(d1, { metricIds: ["metric_bad"] });
  const duplicate = await readPlatformTextMetricsProjection(d1, { metricIds: [validId, validId] });

  assert.deepEqual(invalid.blockers, ["metric_ids_invalid_or_duplicate"]);
  assert.deepEqual(duplicate.blockers, ["metric_ids_invalid_or_duplicate"]);
  assert.equal(d1.calls.length, 0);
});

test("uses SELECT-only access and remains disconnected from routes and live D1", async () => {
  const [metricsRoute, previewRoute, source] = await Promise.all([
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/platform-text-metrics-reader.mjs", import.meta.url), "utf8"),
  ]);
  const sql = buildPlatformTextMetricsReadSql(2);

  assert.match(sql, /^SELECT /);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i);
  assert.ok([metricsRoute, previewRoute].every((content) => !content.includes("platform-text-metrics-reader")));
  assert.equal(source.includes("getDb"), false);
  assert.equal(source.includes("fetch("), false);
});
