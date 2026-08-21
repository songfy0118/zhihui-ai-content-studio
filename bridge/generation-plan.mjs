import { validatePilotExecutionApproval } from "./pilot-execution-gate.mjs";

function engineState(engineRows, id) {
  const engine = engineRows.find((row) => row.id === id);
  return {
    engineReady: engine?.ready === true,
    engineStatus: engine?.status ?? "engine_status_unknown",
    engineAction: engine?.action ?? "先检查本机引擎状态",
  };
}

function withEngine(stage, engineRows, engineId, fallbackBlocker) {
  const state = engineState(engineRows, engineId);
  const blockerCode = stage.ready ? null : state.engineReady ? fallbackBlocker : state.engineStatus;
  return {
    ...stage,
    engineId,
    ...state,
    blockerCode,
    blockerDetail: stage.ready ? null : state.engineReady ? stage.detail : state.engineAction,
    authorizationRequired: ["external_configuration_required", "missing_required_credential", "model_weights_missing"].includes(blockerCode),
  };
}

export function buildGenerationPlan(engineOutputs = {}, readiness = {}, engineRows = []) {
  const storyboardCount = Number(engineOutputs.storyboardCount ?? 0);
  const sceneVideoCount = Number(engineOutputs.sceneVideoCount ?? 0);
  const storyboardAudioReadyCount = Number(engineOutputs.storyboardAudioReadyCount ?? 0);
  const finalCount = Number(engineOutputs.finalVideoCount ?? 0) + Number(engineOutputs.completedMergeCount ?? 0);
  const subtitlesReady = Array.isArray(readiness.artifactChecks)
    && readiness.artifactChecks.some((artifact) => artifact.kind === "subtitles" && artifact.verified === true && artifact.eligibleForProduction !== false);

  const stages = [
    withEngine({ id: "storyboards", label: "角色与分镜", engine: "LocalMiniDrama", ready: storyboardCount > 0, completed: storyboardCount, total: storyboardCount, detail: storyboardCount > 0 ? `${storyboardCount} 个分镜已存在` : "尚无可执行分镜" }, engineRows, "localminidrama", "storyboards_missing"),
    withEngine({ id: "scene_video", label: "分镜画面", engine: "LumenX → LocalMiniDrama", ready: storyboardCount > 0 && sceneVideoCount >= storyboardCount, completed: sceneVideoCount, total: storyboardCount, detail: storyboardCount > 0 ? `还缺 ${Math.max(0, storyboardCount - sceneVideoCount)} 个场景视频` : "等待分镜" }, engineRows, "lumenx", "scene_videos_missing"),
    withEngine({ id: "voice", label: "配音", engine: "CosyVoice", ready: storyboardCount > 0 && storyboardAudioReadyCount >= storyboardCount, completed: storyboardAudioReadyCount, total: storyboardCount, detail: storyboardCount > 0 ? `还缺 ${Math.max(0, storyboardCount - storyboardAudioReadyCount)} 个分镜配音` : "等待分镜" }, engineRows, "cosyvoice", "storyboard_audio_missing"),
    withEngine({ id: "merge", label: "合成成片", engine: "LocalMiniDrama", ready: finalCount > 0, completed: finalCount > 0 ? 1 : 0, total: 1, detail: finalCount > 0 ? "已发现真实合成视频" : "等待画面与配音后合成" }, engineRows, "localminidrama", "upstream_artifacts_missing"),
    { id: "package", label: "三平台审核包", engine: "知绘工厂", engineId: "zhihui", engineReady: true, engineStatus: "ready", engineAction: null, ready: readiness.eligible === true, completed: readiness.eligible === true ? 1 : 0, total: 1, detail: readiness.eligible === true ? "已具备人工审核资格" : subtitlesReady ? "字幕已登记，等待视频与音频" : "等待视频、音频与字幕", blockerCode: readiness.eligible === true ? null : "production_artifacts_missing", blockerDetail: readiness.eligible === true ? null : "等待真实视频与音频通过校验", authorizationRequired: false },
  ];
  const sceneEngine = stages.find((stage) => stage.id === "scene_video");
  const voiceEngine = stages.find((stage) => stage.id === "voice");
  const candidate = engineOutputs.pilotCandidate;
  const executionGate = candidate ? validatePilotExecutionApproval({
    candidate,
    credentialConfigured: sceneEngine?.engineReady === true,
    localVoiceReady: voiceEngine?.engineReady === true,
  }) : null;
  const pilotApproval = candidate && executionGate ? {
    storyboardId: candidate.storyboardId,
    storyboardNumber: candidate.storyboardNumber,
    title: candidate.title,
    duration: candidate.duration,
    aspectRatio: candidate.aspectRatio,
    requestHash: candidate.requestHash,
    inputComplete: candidate.inputComplete === true,
    promptsReturned: false,
    plannedOperations: [
      { id: "still_image", engine: "LumenX", callType: "external_model", count: 1 },
      { id: "scene_video", engine: "LumenX", callType: "external_model", count: 1 },
      { id: "voice_audio", engine: "CosyVoice", callType: "local_inference", count: 1 },
    ],
    externalModelCalls: 2,
    localInferenceCalls: 1,
    costEstimate: null,
    costStatus: "unknown_until_provider_and_model_are_selected",
    approvalInputs: { provider: null, imageModel: null, videoModel: null, imageCostCny: null, videoCostCny: null, pricingConfirmed: false, maxCostCny: null, approvedRequestHash: null },
    executionGate,
    userApprovalRequired: true,
    userApproved: false,
    readyToExecute: executionGate.eligible,
    willExecute: false,
    generatedMedia: false,
    publishable: false,
  } : null;

  return {
    automaticExecution: false,
    generatedMedia: false,
    nextStageIds: stages.filter((stage) => !stage.ready).map((stage) => stage.id),
    stages,
    pilotApproval,
  };
}
