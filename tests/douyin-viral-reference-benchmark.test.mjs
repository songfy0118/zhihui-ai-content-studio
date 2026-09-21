import assert from "node:assert/strict";
import test from "node:test";

import {
  DOUYIN_VIRAL_REFERENCE_POLICY,
  assessDouyinViralReferenceBenchmark,
} from "../bridge/douyin-viral-reference-benchmark.mjs";

const patterns = DOUYIN_VIRAL_REFERENCE_POLICY.allowedHookPatterns;

function sample(index, overrides = {}) {
  return {
    id: `sample-${index}`,
    url: `https://www.douyin.com/video/${7000000000000000000n + BigInt(index)}`,
    creatorId: `creator-${index % 25}`,
    title: `用于验证爆款样本门槛的合成标题 ${index}`,
    format: index % 3 === 0 ? "image_text" : "video",
    hookPattern: patterns[index % patterns.length],
    visibleEngagement: 10_000 + index,
    metricSource: "douyin_visible_result",
    aiOrTechnologyRelevant: true,
    ...overrides,
  };
}

test("requires one hundred high-engagement samples across independent creators and repeated hooks", () => {
  const result = assessDouyinViralReferenceBenchmark(Array.from({ length: 100 }, (_, index) => sample(index)));
  assert.equal(result.status, "douyin_viral_reference_benchmark_ready");
  assert.equal(result.qualifiedSampleCount, 100);
  assert.equal(result.independentCreatorCount, 25);
  assert.equal(result.reusablePatternCount, patterns.length);
  assert.equal(result.formatCounts.image_text, 34);
  assert.equal(result.formatCounts.video, 66);
  assert.equal(result.readyForHookCalibration, true);
  assert.match(result.benchmarkFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.generatedTitles, false);
  assert.equal(result.draftChanged, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
});

test("blocks ordinary one-thousand-count samples instead of treating them as viral references", () => {
  const result = assessDouyinViralReferenceBenchmark(Array.from({ length: 131 }, (_, index) => sample(index, {
    visibleEngagement: index < 32 ? 10_000 + index : 1_000 + index,
  })));
  assert.equal(result.qualifiedSampleCount, 32);
  assert.ok(result.blockers.includes("not_enough_high_engagement_samples"));
  assert.equal(result.readyForHookCalibration, false);
});

test("deduplicates URLs and rejects invalid or off-topic evidence", () => {
  const samples = Array.from({ length: 100 }, (_, index) => sample(index));
  samples.push(sample(101, { url: samples[0].url }));
  samples.push(sample(102, { aiOrTechnologyRelevant: false }));
  const result = assessDouyinViralReferenceBenchmark(samples);
  assert.equal(result.duplicateSampleCount, 1);
  assert.equal(result.invalidSampleCount, 1);
  assert.ok(result.blockers.includes("invalid_douyin_reference_samples_present"));
  assert.equal(result.readyForHookCalibration, false);
});
