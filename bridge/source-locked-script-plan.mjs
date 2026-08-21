const SHA256 = /^[a-f0-9]{64}$/;
const LOOPBACK_API_BASE = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/api\/v1$/i;

function buildPremise(envelope) {
  const claims = envelope.claims.map((claim) => (
    `[${claim.id}] ${claim.text} (sources: ${claim.sourceRefs.join(", ")})`
  ));
  const sources = envelope.sources.map((source) => `[${source.id}] ${source.url}`);
  return [
    `Title: ${envelope.idea.title}`,
    `Angle: ${envelope.idea.angle}`,
    "Use only the reviewed factual claims below. Do not add uncited factual claims. Preserve uncertainty and source notes.",
    "Reviewed claims:",
    ...claims,
    "Retained sources:",
    ...sources,
  ].join("\n");
}

export function buildSourceLockedScriptPlan({
  envelope,
  localMiniDramaBaseUrl = "http://127.0.0.1:5679/api/v1",
  dramaId = null,
  episodeCount = 1,
} = {}) {
  const blockers = [];
  const normalizedBaseUrl = typeof localMiniDramaBaseUrl === "string"
    ? localMiniDramaBaseUrl.replace(/\/$/, "")
    : "";
  const normalizedEpisodeCount = Number(episodeCount);

  if (envelope?.ready !== true) blockers.push("source_locked_envelope_not_ready");
  if (!SHA256.test(envelope?.inputFingerprint ?? "")) blockers.push("source_locked_fingerprint_invalid");
  if (!LOOPBACK_API_BASE.test(normalizedBaseUrl)) blockers.push("localminidrama_loopback_required");
  if (!(Number.isInteger(normalizedEpisodeCount) && normalizedEpisodeCount >= 1 && normalizedEpisodeCount <= 3)) {
    blockers.push("episode_count_unsupported");
  }

  if (blockers.length > 0) {
    return {
      ready: false,
      blockers,
      request: null,
      dispatchAllowed: false,
      modelCalls: 0,
      externalCalls: 0,
      costIncurred: false,
      scriptGenerated: false,
      generatedMedia: false,
      publishTriggered: false,
    };
  }

  const body = {
    premise: buildPremise(envelope),
    style: "science explainer comic",
    type: "fact-checked short-form vertical video",
    episode_count: normalizedEpisodeCount,
    metadata: {
      source_lock_fingerprint: envelope.inputFingerprint,
      reviewed_at: envelope.factReview.reviewedAt,
      target_platforms: envelope.targets,
      constraints: envelope.constraints,
      claim_count: envelope.claims.length,
      source_count: envelope.sources.length,
    },
  };
  if (Number.isInteger(Number(dramaId)) && Number(dramaId) > 0) body.drama_id = Number(dramaId);

  return {
    ready: true,
    blockers: [],
    sourceLockFingerprint: envelope.inputFingerprint,
    sourceContract: "vendor/LocalMiniDrama/backend-node/src/routes/index.js",
    request: {
      id: "localminidrama_story_generation",
      method: "POST",
      url: `${normalizedBaseUrl}/generation/story`,
      body,
    },
    downstream: {
      engine: "LumenX",
      status: "waiting_for_script_and_storyboards",
      requestCount: 0,
      dispatchAllowed: false,
    },
    authorizationRequired: true,
    authorizationReason: "script_model_provider_and_cost_must_be_confirmed",
    dispatchAllowed: false,
    plannedModelCalls: 1,
    modelCalls: 0,
    externalCalls: 0,
    costEstimate: null,
    costIncurred: false,
    scriptGenerated: false,
    generatedMedia: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export function summarizeSourceLockedScriptPlan(plan) {
  return {
    readyForAuthorization: plan?.ready === true,
    blockers: Array.isArray(plan?.blockers) ? [...plan.blockers] : ["script_plan_unavailable"],
    sourceLockFingerprint: plan?.sourceLockFingerprint ?? null,
    adapter: plan?.request?.id ?? "localminidrama_story_generation",
    method: plan?.request?.method ?? null,
    endpoint: plan?.request?.url ?? null,
    claimCount: plan?.request?.body?.metadata?.claim_count ?? 0,
    sourceCount: plan?.request?.body?.metadata?.source_count ?? 0,
    targetPlatforms: plan?.request?.body?.metadata?.target_platforms ?? [],
    downstream: plan?.downstream ?? null,
    premiseReturned: false,
    requestBodyReturned: false,
    authorizationRequired: plan?.authorizationRequired === true,
    dispatchAllowed: false,
    plannedModelCalls: plan?.plannedModelCalls ?? 0,
    modelCalls: 0,
    externalCalls: 0,
    costIncurred: false,
    scriptGenerated: false,
    generatedMedia: false,
    publishTriggered: false,
    businessResult: false,
  };
}
