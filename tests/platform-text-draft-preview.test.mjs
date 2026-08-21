import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextDraftPreview } from "../bridge/platform-text-draft-preview.mjs";

function readyBlueprint() {
  const blueprint = {
    acceptanceReadFingerprint: "a".repeat(64),
    acceptanceFingerprint: "b".repeat(64),
    editorialAngle: "这个虚构测试为何需要双来源确认？",
    angleOrigin: "human_provided",
    targets: ["xiaohongshu", "douyin"],
    approvedClaimBlocks: [{
      blockId: "claim-1",
      claimId: "c".repeat(64),
      blockType: "exact_human_accepted_claim",
      exactApprovedWording: "两条模拟来源均描述同一个虚构测试，但不代表真实新闻。",
      uncertaintyNote: "人工接受谨慎措辞，并要求保留真实性尚未确认的说明。",
      sourceRefs: ["claim-1-independent", "claim-1-original"],
      rewriteAllowed: false,
    }],
    sourceLedger: [
      { sourceRef: "claim-1-independent", claimId: "c".repeat(64), candidateId: "d".repeat(64), evidenceId: "independent-one", sourceId: "independent-source", evidenceRole: "independent", canonicalUrl: "https://independent.example/report", supportingSentence: "模拟独立来源描述同一虚构测试。" },
      { sourceRef: "claim-1-original", claimId: "c".repeat(64), candidateId: "e".repeat(64), evidenceId: "original-one", sourceId: "official-source", evidenceRole: "original", canonicalUrl: "https://official.example/release", supportingSentence: "模拟官方来源描述虚构测试。" },
    ],
    platformStructures: {
      xiaohongshu: { platform: "xiaohongshu", contentMode: "text_image_carousel_structure", requestedFields: ["title", "body", "coverText", "hashtags", "sourceNote"], sectionOrder: ["cover", "approved_claim_cards"], editorialAngle: "这个虚构测试为何需要双来源确认？", approvedClaimBlockIds: ["claim-1"], draftFields: { title: null }, generated: false },
      douyin: { platform: "douyin", contentMode: "text_image_post_structure", requestedFields: ["title", "body", "coverText", "hashtags", "sourceNote"], sectionOrder: ["cover", "approved_claim_cards"], editorialAngle: "这个虚构测试为何需要双来源确认？", approvedClaimBlockIds: ["claim-1"], draftFields: { title: null }, generated: false },
    },
    constraints: ["use_only_exact_human_accepted_claim_wording"],
  };
  const blueprintFingerprint = createHash("sha256").update(JSON.stringify(blueprint)).digest("hex");
  return {
    status: "accepted_claim_draft_blueprint_ready",
    readyForHumanCopyDrafting: true,
    blueprint,
    blueprintFingerprint,
    targetPlatforms: ["xiaohongshu", "douyin"],
  };
}

const submissions = {
  xiaohongshu: {
    title: "一条新闻为何要看两遍？",
    coverText: "双来源重要吗？",
    openingHook: "同一条消息，为什么不能只看一个来源？",
    closingPrompt: "你平时会交叉核对新闻来源吗？",
    hashtags: ["科技观察", "信息核验", "新闻阅读"],
  },
  douyin: {
    title: "为什么一条消息需要两个来源？",
    coverText: "别只看一个来源？",
    openingHook: "看到一个抓眼标题时，你会先找第二个来源吗？",
    closingPrompt: "你还想看哪些信息核验方法？",
    hashtags: ["科技资讯", "媒体素养", "事实核验"],
  },
};

test("builds complete two-platform copy previews bound to a confirmed blueprint", () => {
  const blueprint = readyBlueprint();
  const result = buildPlatformTextDraftPreview(blueprint, submissions, { confirmedBlueprintFingerprint: blueprint.blueprintFingerprint });

  assert.equal(result.status, "platform_text_draft_preview_ready");
  assert.equal(result.readyForHumanDraftReview, true);
  assert.equal(result.platformDraftCount, 2);
  assert.match(result.previewFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(result.platformDrafts), ["xiaohongshu", "douyin"]);
  assert.equal(result.platformDrafts.xiaohongshu.status, "preview_not_saved");
  assert.equal(result.platformDrafts.douyin.contentMode, "text_image_post_structure");
});

test("uses exact accepted wording and persisted URLs without inventing factual body claims", () => {
  const blueprint = readyBlueprint();
  const result = buildPlatformTextDraftPreview(blueprint, submissions, { confirmedBlueprintFingerprint: blueprint.blueprintFingerprint });
  const acceptedClaim = blueprint.blueprint.approvedClaimBlocks[0].exactApprovedWording;
  const draft = result.platformDrafts.xiaohongshu;

  assert.ok(draft.body.includes(acceptedClaim));
  assert.ok(draft.body.includes(blueprint.blueprint.approvedClaimBlocks[0].uncertaintyNote));
  assert.ok(draft.sourceNote.includes("https://independent.example/report"));
  assert.ok(draft.sourceNote.includes("https://official.example/release"));
  assert.equal(draft.copyOrigin, "human_packaging_plus_exact_accepted_claims");
  assert.equal(result.acceptedClaimWordingPreserved, true);
  assert.equal(result.factsVerified, false);
  assert.equal(result.humanPackagingClaimsUnchecked, true);
});

test("keeps the preview deterministic and binds changes to human packaging", () => {
  const blueprint = readyBlueprint();
  const options = { confirmedBlueprintFingerprint: blueprint.blueprintFingerprint };
  const first = buildPlatformTextDraftPreview(blueprint, submissions, options);
  const repeat = buildPlatformTextDraftPreview(structuredClone(blueprint), structuredClone(submissions), options);
  const changed = structuredClone(submissions);
  changed.douyin.closingPrompt = "下一期你想先核验哪类科技消息？";
  const changedResult = buildPlatformTextDraftPreview(blueprint, changed, options);

  assert.equal(first.previewFingerprint, repeat.previewFingerprint);
  assert.notEqual(first.previewFingerprint, changedResult.previewFingerprint);
});

test("fails closed for unconfirmed blueprints, incomplete packages or performance promises", () => {
  const blueprint = readyBlueprint();
  const mismatch = buildPlatformTextDraftPreview(blueprint, submissions, { confirmedBlueprintFingerprint: "f".repeat(64) });
  assert.ok(mismatch.blockers.includes("accepted_claim_blueprint_confirmation_mismatch"));

  const incomplete = structuredClone(submissions);
  delete incomplete.xiaohongshu.title;
  const missing = buildPlatformTextDraftPreview(blueprint, incomplete, { confirmedBlueprintFingerprint: blueprint.blueprintFingerprint });
  assert.ok(missing.blockers.includes("xiaohongshu:title_invalid"));

  const risky = structuredClone(submissions);
  risky.douyin.openingHook = "这条内容保证百万播放，你信吗？";
  const promised = buildPlatformTextDraftPreview(blueprint, risky, { confirmedBlueprintFingerprint: blueprint.blueprintFingerprint });
  assert.ok(promised.blockers.includes("douyin:performance_promise"));
  assert.equal(promised.draftPreviewBuilt, false);

  const targetMismatch = structuredClone(blueprint);
  targetMismatch.targetPlatforms = ["xiaohongshu"];
  const mismatchedTargets = buildPlatformTextDraftPreview(targetMismatch, submissions, { confirmedBlueprintFingerprint: blueprint.blueprintFingerprint });
  assert.ok(mismatchedTargets.blockers.includes("accepted_claim_blueprint_targets_mismatch"));
});

test("keeps model, storage, platform save and publication actions disabled", async () => {
  const blueprint = readyBlueprint();
  const result = buildPlatformTextDraftPreview(blueprint, submissions, { confirmedBlueprintFingerprint: blueprint.blueprintFingerprint });
  assert.equal(result.draftPreviewBuilt, true);
  assert.equal(result.draftGenerated, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("platform-text-draft-preview")));
});
