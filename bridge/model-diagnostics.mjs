const MODEL_STAGES = Object.freeze([
  { id: "text", types: ["text"], label: "文本与剧本", missing: "缺少文本模型配置", action: "在本机 AI 配置中新增文本服务；保存后先手动测试连接，再生成剧本。" },
  { id: "image", types: ["image", "storyboard_image"], label: "角色与分镜图片", missing: "缺少图片模型配置", action: "新增图片服务后先生成 1 张测试分镜，确认画风与计费，再批量生成。" },
  { id: "video", types: ["video"], label: "分镜视频", missing: "缺少视频模型配置", action: "新增视频服务后只测试 1 个分镜；视频调用可能收费，不会自动测试。" },
  { id: "tts", types: ["tts"], label: "配音", missing: "缺少 TTS 配置", action: "新增 TTS 服务或接入 CosyVoice 后先合成 1 句旁白；不会自动测试。" },
]);

function modelsOf(config) {
  if (Array.isArray(config.model)) return config.model.filter(Boolean);
  if (typeof config.model === "string" && config.model.trim()) return [config.model.trim()];
  if (typeof config.default_model === "string" && config.default_model.trim()) return [config.default_model.trim()];
  return [];
}

function missingFields(config) {
  const fields = [];
  if (!config.provider) fields.push("provider");
  if (!config.base_url) fields.push("base_url");
  if (!config.api_key) fields.push("api_key");
  if (modelsOf(config).length === 0) fields.push("model");
  return fields;
}

function safeService(config) {
  return {
    name: config.name ?? config.provider ?? "未命名服务",
    provider: config.provider ?? "unknown",
    models: modelsOf(config),
    active: config.is_active !== false,
  };
}

export function diagnoseModelConfigs(configs = []) {
  return MODEL_STAGES.map((spec) => {
    const matching = configs.filter((config) => spec.types.includes(config.service_type));
    const active = matching.filter((config) => config.is_active !== false);
    const complete = active.filter((config) => missingFields(config).length === 0);
    const incompleteFields = [...new Set(active.flatMap(missingFields))];
    let diagnosticCode = "configured_unverified";
    let detail = `${complete.length} 个配置完整；尚未发起连接测试`;
    if (matching.length === 0) {
      diagnosticCode = "missing_configuration";
      detail = spec.missing;
    } else if (active.length === 0) {
      diagnosticCode = "inactive_configuration";
      detail = `${matching.length} 个配置均已停用`;
    } else if (complete.length === 0) {
      diagnosticCode = "incomplete_configuration";
      detail = `配置缺少：${incompleteFields.join("、")}`;
    }
    return {
      id: spec.id,
      label: spec.label,
      ready: complete.length > 0,
      required: true,
      detail,
      diagnosticCode,
      action: spec.action,
      verification: "not_run",
      automaticTest: false,
      services: matching.map(safeService),
    };
  });
}
