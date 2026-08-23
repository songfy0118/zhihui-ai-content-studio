import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readPlatformTextDurableReviewInputReadiness } from "../bridge/platform-text-durable-review-input-readiness.mjs";

const DRAFT_FINGERPRINT = "d".repeat(64);
const VISUAL_FINGERPRINT = "e".repeat(64);

function readers({ draftReady = true, visualReady = true } = {}) {
  return {
    draftReviewReader: {
      async readByReviewFingerprint(fingerprint) {
        return draftReady ? {
          status: "platform_text_draft_review_read_ready",
          blockers: [],
          found: true,
          receipt: { reviewFingerprint: fingerprint },
          reviewedPlatforms: 2,
          durableHumanReview: true,
          durableReviewInputReady: true,
          databaseReadAttempted: true,
          databaseReads: 1,
        } : {
          status: "platform_text_draft_review_not_found",
          blockers: ["platform_text_draft_review_not_found"],
          found: false,
          databaseReadAttempted: true,
          databaseReads: 1,
        };
      },
    },
    visualReviewReader: {
      async readByVisualReviewFingerprint(fingerprint) {
        return visualReady ? {
          status: "platform_text_visual_review_read_ready",
          blockers: [],
          found: true,
          receipt: { visualReviewFingerprint: fingerprint },
          reviewedPlatforms: 2,
          reviewedAssets: 8,
          durableHumanReview: true,
          durableVisualReviewInputReady: true,
          databaseReadAttempted: true,
          databaseReads: 1,
        } : {
          status: "platform_text_visual_review_not_found",
          blockers: ["platform_text_visual_review_not_found"],
          found: false,
          databaseReadAttempted: true,
          databaseReads: 1,
        };
      },
    },
  };
}

test("reads both durable review inputs without returning receipt contents", async () => {
  const result = await readPlatformTextDurableReviewInputReadiness({
    draftReviewFingerprint: DRAFT_FINGERPRINT,
    visualReviewFingerprint: VISUAL_FINGERPRINT,
  }, readers());

  assert.equal(result.status, "platform_text_durable_review_inputs_ready");
  assert.equal(result.inputsReady, true);
  assert.equal(result.durableDraftReviewReady, true);
  assert.equal(result.durableVisualReviewReady, true);
  assert.equal(result.draftReview.reviewedPlatforms, 2);
  assert.equal(result.visualReview.reviewedAssets, 8);
  assert.equal(result.databaseReads, 2);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal("receipt" in result.draftReview, false);
  assert.equal("receipt" in result.visualReview, false);
});

test("fails closed before database reads for invalid fingerprints", async () => {
  let calls = 0;
  const trackingReaders = readers();
  trackingReaders.draftReviewReader.readByReviewFingerprint = async () => { calls += 1; };
  trackingReaders.visualReviewReader.readByVisualReviewFingerprint = async () => { calls += 1; };
  const result = await readPlatformTextDurableReviewInputReadiness({
    draftReviewFingerprint: "invalid",
    visualReviewFingerprint: VISUAL_FINGERPRINT,
  }, trackingReaders);

  assert.deepEqual(result.blockers, ["platform_text_draft_review_fingerprint_invalid"]);
  assert.equal(result.databaseReadAttempted, false);
  assert.equal(calls, 0);
});

test("reports either missing durable input without unlocking downstream work", async () => {
  const result = await readPlatformTextDurableReviewInputReadiness({
    draftReviewFingerprint: DRAFT_FINGERPRINT,
    visualReviewFingerprint: VISUAL_FINGERPRINT,
  }, readers({ visualReady: false }));

  assert.equal(result.status, "platform_text_durable_review_inputs_blocked");
  assert.equal(result.inputsReady, false);
  assert.equal(result.durableDraftReviewReady, true);
  assert.equal(result.durableVisualReviewReady, false);
  assert.deepEqual(result.blockers, ["platform_text_visual_review_not_found"]);
  assert.equal(result.databaseReads, 2);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
});

test("keeps the API route read-only and free of creator platform adapters", async () => {
  const route = await readFile(new URL("../app/api/news/platform-text-durable-review-input-readiness/route.ts", import.meta.url), "utf8");
  assert.match(route, /createPlatformTextDraftReviewReader/);
  assert.match(route, /createPlatformTextVisualReviewReader/);
  assert.match(route, /readPlatformTextDurableReviewInputReadiness/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.batch\(|\.exec\(|fetch\(|playwright|puppeteer|creator\.douyin|xiaohongshu/);
  assert.doesNotMatch(route, /export async function GET/);
});
