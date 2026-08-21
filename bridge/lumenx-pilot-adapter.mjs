const REQUEST_HASH = /^[a-f0-9]{64}$/;
const LOOPBACK_BASE_URL = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i;
const SUPPORTED_RATIOS = new Set(["16:9", "9:16", "1:1"]);
const IMAGE_SIZE_BY_RATIO = {
  "16:9": "1280*720",
  "9:16": "720*1280",
  "1:1": "1280*1280",
};

function selected(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildLumenXPilotPlan({
  candidate,
  lumenxBaseUrl = "http://127.0.0.1:17177",
  imageModel = "wan2.7-image-pro",
  videoModel = "happyhorse-1.1-i2v",
} = {}) {
  const blockers = [];
  const baseUrl = typeof lumenxBaseUrl === "string" ? lumenxBaseUrl.replace(/\/$/, "") : "";
  const duration = Number(candidate?.duration);
  const aspectRatio = candidate?.aspectRatio;

  if (!LOOPBACK_BASE_URL.test(baseUrl)) blockers.push("lumenx_loopback_required");
  if (!REQUEST_HASH.test(candidate?.requestHash ?? "")) blockers.push("pilot_request_hash_invalid");
  if (!selected(candidate?.imagePrompt)) blockers.push("image_prompt_missing");
  if (!selected(candidate?.videoPrompt)) blockers.push("video_prompt_missing");
  if (!SUPPORTED_RATIOS.has(aspectRatio)) blockers.push("aspect_ratio_unsupported");
  if (!(Number.isFinite(duration) && duration >= 2 && duration <= 15)) blockers.push("duration_unsupported");
  if (!selected(imageModel)) blockers.push("image_model_missing");
  if (!selected(videoModel)) blockers.push("video_model_missing");

  if (blockers.length) {
    return {
      ready: false,
      blockers,
      requests: [],
      dispatchAllowed: false,
      externalCalls: 0,
      costIncurred: false,
      generatedMedia: false,
    };
  }

  const endpoint = `${baseUrl}/playground/generate`;
  return {
    ready: true,
    blockers: [],
    adapter: "lumenx_playground",
    provider: "dashscope",
    sourceContract: "vendor/lumenx/src/apps/playground/models.py",
    catalogSource: "vendor/lumenx/config/model_catalog/catalog.meta.yaml",
    catalogVerification: "local_snapshot_only",
    pricingVerified: false,
    requestHash: candidate.requestHash,
    requests: [
      {
        id: "still_image",
        method: "POST",
        url: endpoint,
        body: {
          mode: "t2i",
          model_id: imageModel.trim(),
          prompt: candidate.imagePrompt.trim(),
          parameters: { size: IMAGE_SIZE_BY_RATIO[aspectRatio], watermark: false },
          batch_size: 1,
        },
      },
      {
        id: "scene_video",
        dependsOn: "still_image",
        method: "POST",
        url: endpoint,
        body: {
          mode: "i2v",
          model_id: videoModel.trim(),
          prompt: candidate.videoPrompt.trim(),
          input_media: ["{{still_image.outputs[0].media_path}}"],
          parameters: { duration, resolution: "720p", ratio: aspectRatio, watermark: false },
          batch_size: 1,
        },
      },
    ],
    dispatchAllowed: false,
    externalCalls: 0,
    costIncurred: false,
    generatedMedia: false,
  };
}

export function summarizeLumenXPilotPlan(plan) {
  return {
    contractReady: plan?.ready === true,
    blockers: Array.isArray(plan?.blockers) ? [...plan.blockers] : ["lumenx_plan_unavailable"],
    adapter: plan?.adapter ?? "lumenx_playground",
    requestHash: plan?.requestHash ?? null,
    steps: Array.isArray(plan?.requests) ? plan.requests.map((request) => ({
      id: request.id,
      mode: request.body?.mode ?? null,
      modelId: request.body?.model_id ?? null,
      dependsOn: request.dependsOn ?? null,
    })) : [],
    catalogVerification: plan?.catalogVerification ?? "not_run",
    pricingVerified: plan?.pricingVerified === true,
    promptBodiesReturned: false,
    requestBodiesReturned: false,
    dispatchAllowed: false,
    externalCalls: 0,
    costIncurred: false,
    generatedMedia: false,
  };
}
