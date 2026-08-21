import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CREDENTIAL_KEYS = Object.freeze([
  "DASHSCOPE_API_KEY",
  "KLING_ACCESS_KEY",
  "KLING_SECRET_KEY",
  "VIDU_API_KEY",
  "MULEROUTER_API_KEY",
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "OSS_BUCKET_NAME",
]);

function usable(value) {
  const normalized = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
  return Boolean(normalized) && !/(^|[-_])(your|example|placeholder|change[-_]?me)([-_]|$)/i.test(normalized);
}

function configuredFromEnvText(text) {
  const configured = new Set();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && CREDENTIAL_KEYS.includes(match[1]) && usable(match[2])) configured.add(match[1]);
  }
  return configured;
}

export function assessLumenXConfiguration(configuredKeys = new Set(), sources = []) {
  const has = (key) => configuredKeys.has(key);
  const dashscopeReady = has("DASHSCOPE_API_KEY");
  const routes = [
    { id: "dashscope", label: "DashScope 基础路线", requiredForPilot: true, configured: dashscopeReady, capability: "Wan / Qwen / TTS" },
    { id: "kling_vendor", label: "Kling 原厂直连", requiredForPilot: false, configured: has("KLING_ACCESS_KEY") && has("KLING_SECRET_KEY"), capability: "Kling 视频" },
    { id: "vidu_vendor", label: "Vidu 原厂直连", requiredForPilot: false, configured: has("VIDU_API_KEY"), capability: "Vidu 视频" },
    { id: "mulerouter", label: "MuleRouter", requiredForPilot: false, configured: has("MULEROUTER_API_KEY"), capability: "Seedance / GPT-Image" },
    { id: "oss", label: "阿里云 OSS", requiredForPilot: false, configured: has("ALIBABA_CLOUD_ACCESS_KEY_ID") && has("ALIBABA_CLOUD_ACCESS_KEY_SECRET") && has("OSS_BUCKET_NAME"), capability: "云端媒体中转" },
  ];
  return {
    readyForPilot: dashscopeReady,
    status: dashscopeReady ? "configured_unverified" : "missing_required_credential",
    routes,
    configuredKeyNames: CREDENTIAL_KEYS.filter((key) => has(key)),
    detectedSources: [...new Set(sources)],
    secretsReturned: false,
    externalCalls: false,
    verification: "not_run",
    costIncurred: false,
    nextAction: dashscopeReady
      ? "基础路线配置已存在；首次调用前仍需单独确认可能产生的费用"
      : "先在 LumenX 设置中配置 DashScope 基础路线；不要同时开通所有可选供应商",
  };
}

export async function inspectLumenXConfiguration(lumenRoot, environment = process.env, userSettingsPath = join(homedir(), ".lumen-x", "config.json")) {
  const configured = new Set(CREDENTIAL_KEYS.filter((key) => usable(environment[key])));
  const sources = configured.size > 0 ? ["process_environment"] : [];
  try {
    const envConfigured = configuredFromEnvText(await readFile(join(lumenRoot, ".env"), "utf8"));
    if (envConfigured.size > 0) sources.push("project_env");
    for (const key of envConfigured) configured.add(key);
  } catch {}
  try {
    const settings = JSON.parse(await readFile(userSettingsPath, "utf8"));
    const settingsKeys = CREDENTIAL_KEYS.filter((key) => usable(settings?.[key]));
    if (settingsKeys.length > 0) sources.push("user_settings");
    for (const key of settingsKeys) configured.add(key);
  } catch {}
  return assessLumenXConfiguration(configured, sources);
}
