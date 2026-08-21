import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MODEL_BYTES = 4_860_000_000;
const REQUIRED_FREE_BYTES = 12_000_000_000;

async function run(file, args) {
  try {
    const { stdout } = await execFileAsync(file, args, { timeout: 5000, windowsHide: true });
    return stdout.trim();
  } catch {
    return "";
  }
}

export function assessCosyVoiceInstallPreflight(facts) {
  const freeBytes = Number(facts.freeBytes ?? 0);
  const gpuMemoryMiB = Number(facts.gpuMemoryMiB ?? 0);
  const diskReady = freeBytes >= REQUIRED_FREE_BYTES;
  const dedicatedEnvPresent = Boolean(facts.dedicatedEnvPresent);
  return {
    model: {
      id: "FunAudioLLM/CosyVoice2-0.5B",
      sourceUrl: "https://huggingface.co/FunAudioLLM/CosyVoice2-0.5B/tree/main",
      license: "Apache-2.0",
      reportedBytes: MODEL_BYTES,
      reportedGiB: Number((MODEL_BYTES / 1024 ** 3).toFixed(2)),
      sourceCheckedAt: "2026-08-07",
    },
    hardware: {
      gpuDetected: Boolean(facts.gpuName),
      gpuName: facts.gpuName || "未检测到 NVIDIA GPU",
      gpuMemoryMiB,
      gpuMemoryGiB: Number((gpuMemoryMiB / 1024).toFixed(1)),
      gpuAssessment: facts.gpuName ? "candidate_unverified" : "gpu_missing",
      gpuDetail: facts.gpuName ? "显卡已检测；仍需用 1 句旁白验证显存峰值和速度" : "未检测到可用 NVIDIA GPU",
    },
    disk: {
      freeBytes,
      freeGiB: Number((freeBytes / 1024 ** 3).toFixed(1)),
      requiredFreeBytes: REQUIRED_FREE_BYTES,
      requiredFreeGiB: Number((REQUIRED_FREE_BYTES / 1024 ** 3).toFixed(1)),
      ready: diskReady,
      detail: diskReady ? "磁盘空间满足模型、缓存和独立环境的预留线" : "磁盘空间不足 12GB 安全预留线",
    },
    runtime: {
      condaInstalled: Boolean(facts.condaInstalled),
      dedicatedEnvPresent,
      recommendedPython: "3.10",
      currentPython: facts.currentPython || "unknown",
      ffmpegReady: Boolean(facts.ffmpegReady),
      ready: Boolean(facts.condaInstalled) && dedicatedEnvPresent && Boolean(facts.ffmpegReady),
      detail: dedicatedEnvPresent ? "独立 cosyvoice 环境已存在" : "尚未创建独立 cosyvoice Python 3.10 环境",
    },
    readyToPrepareEnvironment: diskReady && Boolean(facts.condaInstalled) && Boolean(facts.ffmpegReady),
    readyToRun: false,
    planAvailable: true,
    planCommand: "npm run cosyvoice:plan",
    smokePlanAvailable: true,
    smokePlanCommand: "npm run cosyvoice:smoke:plan",
    approvalRequired: true,
    downloadTriggered: false,
    nextAction: dedicatedEnvPresent ? "确认后下载官方模型，再生成 1 句测试旁白" : "确认后先创建独立 Python 3.10 环境；不要复用现有研究环境",
  };
}

export async function inspectCosyVoiceInstallPreflight(projectRoot) {
  const [gpuOutput, pythonOutput, condaOutput, ffmpegOutput, disk] = await Promise.all([
    run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]),
    run("python", ["--version"]),
    process.platform === "win32" ? run("cmd.exe", ["/d", "/s", "/c", "conda env list --json"]) : run("conda", ["env", "list", "--json"]),
    run("ffmpeg", ["-version"]),
    statfs(projectRoot),
  ]);
  const [gpuName = "", gpuMemory = "0"] = gpuOutput.split(",").map((value) => value.trim());
  let condaEnvironments = [];
  try { condaEnvironments = JSON.parse(condaOutput).envs ?? []; } catch {}
  const dedicatedEnvPresent = condaEnvironments.some((path) => /[/\\]envs[/\\](?:zhihui-)?cosyvoice$/i.test(path));
  return assessCosyVoiceInstallPreflight({
    gpuName,
    gpuMemoryMiB: Number(gpuMemory),
    freeBytes: Number(disk.bavail) * Number(disk.bsize),
    condaInstalled: Boolean(condaOutput),
    dedicatedEnvPresent,
    currentPython: pythonOutput.replace(/^Python\s+/i, ""),
    ffmpegReady: /^ffmpeg version/i.test(ffmpegOutput),
  });
}
