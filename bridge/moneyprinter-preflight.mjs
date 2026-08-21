import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function run(file, args) {
  try {
    const { stdout } = await execFileAsync(file, args, { timeout: 5000, windowsHide: true });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

export function assessMoneyPrinterPreflight(facts = {}) {
  const blockers = [];
  if (!facts.codePresent) blockers.push("code_missing");
  if (!facts.configPresent) blockers.push("configuration_missing");
  else blockers.push("configuration_not_read_secret_boundary");
  if (!facts.dedicatedEnvPresent) blockers.push("runtime_environment_missing");
  if (!facts.ffmpegReady) blockers.push("ffmpeg_missing");
  blockers.push("source_rights_unverified", "facts_not_verified");
  return {
    engine: {
      id: "MoneyPrinterTurbo",
      license: "MIT",
      codePresent: Boolean(facts.codePresent),
      configurationPresent: Boolean(facts.configPresent),
      configurationRead: false,
      secretsReturned: false,
    },
    runtime: {
      dedicatedEnvPresent: Boolean(facts.dedicatedEnvPresent),
      documentedPython: "3.11+",
      currentPython: facts.currentPython || "unknown",
      ffmpegReady: Boolean(facts.ffmpegReady),
      verifiedByInference: false,
    },
    sourcePolicy: {
      selectedSource: null,
      allowedSources: ["licensed_local", "pexels", "pixabay", "coverr"],
      recommendedUntilReview: "licensed_local",
      perAssetRightsRequired: true,
      rightsVerified: false,
      remoteMaterialCallsAllowed: false,
      bundledMusicCount: Number(facts.bundledMusicCount ?? 0),
      bundledMusicAllowedForProduction: false,
      bundledMusicReason: "本机 README 明示默认音乐可能存在版权问题；未逐项核权前不得进入生产包",
    },
    factPolicy: {
      mayDraftFromApprovedSources: true,
      mayEstablishNewsFacts: false,
      upstreamFactReviewRequired: true,
      newsFetched: false,
      factsVerified: false,
    },
    routePolicy: {
      defaultForScienceComic: false,
      useWhen: "选择资讯口播路线，且来源事实、素材版权和平台文案均已人工审核",
      preferredAudioInput: "CosyVoice 或已获商用授权的真实配音",
      automaticPublish: false,
    },
    readyForPlanning: Boolean(facts.codePresent),
    readyForSmokeTest: false,
    readyForProduction: false,
    blockers,
    automaticDownloads: false,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishTriggered: false,
    nextAction: facts.configPresent ? "配置文件存在但未读取；需本人授权后再做不回显密钥的字段级检查" : "先保持资讯口播路线为备选；配置模型或素材 API 前需本人授权",
  };
}

export async function inspectMoneyPrinterPreflight(projectRoot) {
  const root = join(projectRoot, "vendor", "MoneyPrinterTurbo");
  const [codeChecks, configPresent, dedicatedEnvPresent, ffmpegOutput, pythonOutput, songs] = await Promise.all([
    Promise.all(["README.md", "main.py", "app/services/material.py"].map((file) => isFile(join(root, file)))),
    isFile(join(root, "config.toml")),
    isDirectory(join(root, ".venv")),
    run("ffmpeg", ["-version"]),
    run("python", ["--version"]),
    readdir(join(root, "resource", "songs"), { withFileTypes: true }).catch(() => []),
  ]);
  return assessMoneyPrinterPreflight({
    codePresent: codeChecks.every(Boolean),
    configPresent,
    dedicatedEnvPresent,
    ffmpegReady: /^ffmpeg version/i.test(ffmpegOutput),
    currentPython: pythonOutput.replace(/^Python\s+/i, ""),
    bundledMusicCount: songs.filter((entry) => entry.isFile()).length,
  });
}
