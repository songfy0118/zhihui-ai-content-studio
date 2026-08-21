import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PLATFORM_TEXT_DRAFT_REVIEW_CHECKS,
  PLATFORM_TEXT_DRAFT_REVIEW_CONFIRMATION,
  buildPlatformTextDraftReviewPreview,
} from "../bridge/platform-text-draft-review-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function draft(platform, values) {
  const content = {
    platform,
    contentMode: platform === "xiaohongshu" ? "text_image_carousel_structure" : "text_image_post_structure",
    title: values.title,
    body: `${values.opening}\n\n1. 两条模拟来源描述同一虚构测试。\n核验备注：真实性尚未确认。\n\n资料来源：\n[1] https://official.example/release\n[2] https://independent.example/report\n\n${values.closing}`,
    coverText: values.coverText,
    hashtags: values.hashtags,
    sourceNote: "[1] https://official.example/release\n[2] https://independent.example/report",
    copyOrigin: "human_packaging_plus_exact_accepted_claims",
    status: "preview_not_saved",
  };
  return { ...content, draftFingerprint: hash(content) };
}

function readyDraftPreview() {
  const blueprintFingerprint = "a".repeat(64);
  const platformDrafts = {
    xiaohongshu: draft("xiaohongshu", { title: "为什么要核对两个来源？", opening: "一条消息为何要看两遍？", closing: "你会核验吗？", coverText: "双来源重要吗？", hashtags: ["科技观察", "信息核验"] }),
    douyin: draft("douyin", { title: "一条消息为什么需要两个来源？", opening: "看到标题时你会先查来源吗？", closing: "你还想核验什么？", coverText: "别只看一个来源？", hashtags: ["科技资讯", "事实核验"] }),
  };
  return {
    status: "platform_text_draft_preview_ready",
    readyForHumanDraftReview: true,
    draftPreviewBuilt: true,
    blueprintFingerprint,
    platformDrafts,
    previewFingerprint: hash({ blueprintFingerprint, platformDrafts }),
  };
}

function completeReviews(preview) {
  return Object.entries(preview.platformDrafts).map(([platform, value]) => ({
    platform,
    approve: true,
    draftFingerprint: value.draftFingerprint,
    reviewNote: `${platform} 文案、来源与不确定性说明已逐项人工检查。`,
    checks: Object.fromEntries(PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.map((check) => [check, true])),
  }));
}

function options(preview) {
  return {
    confirmedPreviewFingerprint: preview.previewFingerprint,
    confirmation: PLATFORM_TEXT_DRAFT_REVIEW_CONFIRMATION,
  };
}

test("builds a deterministic non-persisted review receipt for both platform drafts", () => {
  const preview = readyDraftPreview();
  const result = buildPlatformTextDraftReviewPreview(preview, completeReviews(preview), options(preview));

  assert.equal(result.status, "platform_text_draft_review_preview_ready");
  assert.equal(result.reviewedPlatformCountInPreview, 2);
  assert.match(result.reviewFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.receiptPreview.receiptId, `ptdrp_${result.reviewFingerprint}`);
  assert.equal(result.idempotencyKey, `platform-text-draft-review:${result.reviewFingerprint}`);
  assert.equal(result.eligibleForAuthorizedReviewSave, true);
  assert.equal(result.semanticVerification, "human_attestation_preview");
});

test("requires current fingerprints, explicit approval and every human check", () => {
  const preview = readyDraftPreview();
  const reviews = completeReviews(preview);
  reviews[0].approve = false;
  reviews[1].checks.source_note_approved = false;
  const result = buildPlatformTextDraftReviewPreview(preview, reviews, {
    confirmedPreviewFingerprint: "f".repeat(64),
    confirmation: null,
  });

  assert.ok(result.blockers.includes("platform_text_draft_preview_fingerprint_mismatch"));
  assert.ok(result.blockers.includes("platform_text_draft_review_confirmation_invalid"));
  assert.ok(result.blockers.includes("xiaohongshu:explicit_platform_approval_required"));
  assert.ok(result.blockers.includes("douyin:human_review_checks_incomplete"));
  assert.equal(result.receiptPreview, null);
});

test("detects changed draft contents and rejects stale review fingerprints", () => {
  const preview = readyDraftPreview();
  const reviews = completeReviews(preview);
  preview.platformDrafts.xiaohongshu.body += "\n篡改内容";
  const result = buildPlatformTextDraftReviewPreview(preview, reviews, options(preview));

  assert.ok(result.blockers.includes("platform_text_draft_preview_invalid_or_tampered"));
  assert.ok(result.blockers.includes("xiaohongshu:platform_not_current_or_duplicate"));
  assert.equal(result.eligibleForAuthorizedReviewSave, false);
});

test("binds review notes to a new fingerprint while remaining deterministic", () => {
  const preview = readyDraftPreview();
  const reviews = completeReviews(preview);
  const first = buildPlatformTextDraftReviewPreview(preview, reviews, options(preview));
  const repeat = buildPlatformTextDraftReviewPreview(structuredClone(preview), structuredClone(reviews), options(preview));
  const changed = structuredClone(reviews);
  changed[0].reviewNote += " 标题也已复读确认。";
  const changedResult = buildPlatformTextDraftReviewPreview(preview, changed, options(preview));

  assert.equal(first.reviewFingerprint, repeat.reviewFingerprint);
  assert.notEqual(first.reviewFingerprint, changedResult.reviewFingerprint);
});

test("does not persist review, save drafts, call models or connect routes", async () => {
  const preview = readyDraftPreview();
  const result = buildPlatformTextDraftReviewPreview(preview, completeReviews(preview), options(preview));
  assert.equal(result.reviewPersisted, false);
  assert.equal(result.readyForDraftHandoff, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.automatedFactVerification, false);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("platform-text-draft-review-preview")));
});
