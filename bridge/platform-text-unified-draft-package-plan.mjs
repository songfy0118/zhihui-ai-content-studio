import { createHash } from "node:crypto";

import { buildPlatformTextVisualAssetHandoffPlan } from "./platform-text-visual-asset-handoff-plan.mjs";
import { buildPlatformTextVisualAssetPlan } from "./platform-text-visual-asset-plan.mjs";
import { renderPlatformTextVisualSvgAssets } from "./platform-text-visual-svg-renderer.mjs";

const HASH = /^[a-f0-9]{64}$/;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_unified_draft_package_plan_blocked",
    blockers: [],
    draftPackagePlanFingerprint: null,
    sourceHandoffFingerprint: null,
    assetPlanFingerprint: null,
    renderFingerprint: null,
    bundleManifestFingerprint: null,
    visualReviewFingerprint: null,
    assetHandoffPlanFingerprint: null,
    packageItems: [],
    platformCount: 0,
    assetCount: 0,
    copyHandoffReady: false,
    reviewedAssetReferencesReady: false,
    draftPackageInputsReady: false,
    eligibleForCreatorPageOpenAuthorization: false,
    readyForDraftHandoff: false,
    visualAssetsReady: false,
    assetUploadReady: false,
    assetsUnlocked: false,
    browserOpenPerformed: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    databaseWrites: false,
    filesystemMutations: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextUnifiedDraftPackagePlan({
  draftHandoffPlan,
  visualAssetPlan,
  svgRender,
  bundleInspection,
  visualReviewRead,
  visualAssetHandoffPlan,
} = {}) {
  const blockers = [];
  const expectedAssetPlan = buildPlatformTextVisualAssetPlan(draftHandoffPlan);
  if (expectedAssetPlan.status !== "platform_text_visual_asset_plan_ready" || !same(expectedAssetPlan, visualAssetPlan)) {
    blockers.push("platform_text_visual_asset_plan_invalid_or_stale");
  }

  const expectedRender = expectedAssetPlan.status === "platform_text_visual_asset_plan_ready"
    ? renderPlatformTextVisualSvgAssets(expectedAssetPlan)
    : null;
  if (
    expectedRender?.status !== "platform_text_visual_svg_render_ready"
    || !same(expectedRender, svgRender)
    || expectedRender.renderFingerprint !== bundleInspection?.renderFingerprint
  ) blockers.push("platform_text_svg_render_invalid_or_stale");

  const expectedAssetHandoff = buildPlatformTextVisualAssetHandoffPlan(bundleInspection, visualReviewRead);
  if (
    expectedAssetHandoff.status !== "platform_text_visual_asset_handoff_plan_ready"
    || !same(expectedAssetHandoff, visualAssetHandoffPlan)
    || expectedAssetHandoff.sourceRenderFingerprint !== expectedRender?.renderFingerprint
  ) blockers.push("platform_text_visual_asset_handoff_invalid_or_stale");

  if (
    draftHandoffPlan?.status !== "platform_text_draft_handoff_plan_ready"
    || draftHandoffPlan?.copyHandoffReady !== true
    || !HASH.test(draftHandoffPlan?.handoffFingerprint ?? "")
    || !Array.isArray(draftHandoffPlan?.handoffItems)
    || draftHandoffPlan.handoffItems.length < 1
    || draftHandoffPlan.handoffItems.length > 2
    || draftHandoffPlan.handoffItems.length !== expectedAssetHandoff.platformPlans?.length
  ) blockers.push("platform_text_draft_handoff_plan_invalid_or_stale");

  if (blockers.length) return safeResult({ blockers: [...new Set(blockers)] });

  const packageItems = [];
  for (const copy of draftHandoffPlan.handoffItems) {
    const visual = expectedAssetHandoff.platformPlans.find((plan) => plan.platform === copy.platform);
    const assetSource = expectedAssetPlan.platformPlans.find((plan) => plan.platform === copy.platform);
    if (
      !visual
      || !assetSource
      || assetSource.draftFingerprint !== copy.draftFingerprint
      || assetSource.reviewFingerprint !== copy.reviewFingerprint
      || visual.assetCount !== assetSource.plannedAssetCount
    ) return safeResult({ blockers: [`platform_text_draft_package_platform_mismatch:${copy.platform ?? "missing"}`] });
    packageItems.push({
      platform: copy.platform,
      creatorEntryUrl: copy.creatorEntryUrl,
      interactionMode: "visible_browser_manual_after_separate_authorization",
      contentMode: copy.contentMode,
      title: copy.title,
      body: copy.body,
      coverText: copy.coverText,
      hashtags: [...copy.hashtags],
      sourceNote: copy.sourceNote,
      draftFingerprint: copy.draftFingerprint,
      draftReviewFingerprint: copy.reviewFingerprint,
      visualReviewFingerprint: expectedAssetHandoff.visualReviewFingerprint,
      assets: visual.assets.map((asset) => ({ ...asset })),
      assetCount: visual.assetCount,
      packageStatus: "reviewed_inputs_ready_pending_creator_open_authorization",
      requiredHumanSteps: [
        "authorize_visible_creator_page_open",
        "verify_visible_account_identity",
        "reconfirm_copy_and_asset_fingerprints",
        "upload_reviewed_assets_and_copy_text_manually",
        "request_separate_authorization_before_saving_draft",
      ],
      creatorPageOpenAuthorized: false,
      draftSaveAuthorized: false,
    });
  }

  const fingerprintPayload = {
    sourceHandoffFingerprint: draftHandoffPlan.handoffFingerprint,
    assetPlanFingerprint: expectedAssetPlan.assetPlanFingerprint,
    renderFingerprint: expectedRender.renderFingerprint,
    bundleManifestFingerprint: expectedAssetHandoff.bundleManifestFingerprint,
    visualReviewFingerprint: expectedAssetHandoff.visualReviewFingerprint,
    assetHandoffPlanFingerprint: expectedAssetHandoff.assetHandoffPlanFingerprint,
    packageItems,
  };
  return safeResult({
    status: "platform_text_unified_draft_package_plan_ready",
    ...fingerprintPayload,
    draftPackagePlanFingerprint: hash(fingerprintPayload),
    platformCount: packageItems.length,
    assetCount: packageItems.reduce((total, item) => total + item.assetCount, 0),
    copyHandoffReady: true,
    reviewedAssetReferencesReady: true,
    draftPackageInputsReady: true,
    eligibleForCreatorPageOpenAuthorization: true,
  });
}
