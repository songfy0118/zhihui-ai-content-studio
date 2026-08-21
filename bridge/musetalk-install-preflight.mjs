import { execFile } from "node:child_process";
import { stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REQUIRED_MODEL_FILES = [
  "models/musetalkV15/musetalk.json",
  "models/musetalkV15/unet.pth",
  "models/syncnet/latentsync_syncnet.pt",
  "models/dwpose/dw-ll_ucoco_384.pth",
  "models/face-parse-bisent/79999_iter.pth",
  "models/face-parse-bisent/resnet18-5c106cde.pth",
  "models/sd-vae/config.json",
  "models/sd-vae/diffusion_pytorch_model.bin",
  "models/whisper/pytorch_model.bin",
];

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

export function assessMuseTalkInstallPreflight(facts = {}) {
  const requiredModelFiles = Number(facts.requiredModelFiles ?? REQUIRED_MODEL_FILES.length);
  const presentModelFiles = Number(facts.presentModelFiles ?? 0);
  const gpuMemoryMiB = Number(facts.gpuMemoryMiB ?? 0);
  const freeBytes = Number(facts.freeBytes ?? 0);
  const modelReady = requiredModelFiles > 0 && presentModelFiles === requiredModelFiles;
  const runtimeCandidateReady = Boolean(facts.condaInstalled) && Boolean(facts.dedicatedEnvPresent) && Boolean(facts.ffmpegReady);
  return {
    model: {
      id: "TMElyralab/MuseTalk 1.5",
      sourceUrl: "https://huggingface.co/TMElyralab/MuseTalk/tree/main",
      license: "MIT",
      requiredModelFiles,
      presentModelFiles,
      ready: modelReady,
      reportedBytes: null,
      sizeVerification: "not_published_in_local_readme",
    },
    hardware: {
      gpuDetected: Boolean(facts.gpuName),
      gpuName: facts.gpuName || "未检测到 NVIDIA GPU",
      gpuMemoryMiB,
      gpuMemoryGiB: Number((gpuMemoryMiB / 1024).toFixed(1)),
      gpuAssessment: facts.gpuName ? "candidate_unverified" : "gpu_missing",
      performanceClaim: "not_tested_on_this_device",
    },
    disk: {
      freeBytes,
      freeGiB: Number((freeBytes / 1024 ** 3).toFixed(1)),
      requiredFreeBytes: null,
      ready: null,
      detail: "本机 README 未给出完整权重体积，因此不伪造磁盘门槛",
    },
    runtime: {
      condaInstalled: Boolean(facts.condaInstalled),
      dedicatedEnvPresent: Boolean(facts.dedicatedEnvPresent),
      recommendedPython: "3.10",
      documentedCuda: "11.7（README 推荐）",
      currentPython: facts.currentPython || "unknown",
      ffmpegReady: Boolean(facts.ffmpegReady),
      candidateReady: runtimeCandidateReady,
      inferenceVerified: false,
    },
    routePolicy: {
      defaultForScienceComic: false,
      useWhen: "明确选择数字人口播，并已提供可商用人像视频与真实配音",
      requiredInputs: ["face_video_or_image", "narration_audio"],
      outputUse: "optional_lip_sync_layer",
    },
    readyForSmokeTest: modelReady && runtimeCandidateReady && Boolean(facts.gpuName),
    readyForProduction: false,
    approvalRequired: true,
    downloadTriggered: false,
    inferenceTriggered: false,
    generatedMedia: false,
    externalCalls: false,
    costIncurred: false,
    nextAction: modelReady ? "如选择数字人口播路线，需单独授权后只做一条非生产口型烟雾测试" : "模型权重下载和独立环境安装均需单独授权；当前继续使用 AI 科普漫剧主路线",
  };
}

export async function inspectMuseTalkInstallPreflight(projectRoot) {
  const modelRoot = join(projectRoot, "vendor", "MuseTalk");
  const [gpuOutput, pythonOutput, condaOutput, ffmpegOutput, disk, modelChecks] = await Promise.all([
    run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]),
    run("python", ["--version"]),
    process.platform === "win32" ? run("cmd.exe", ["/d", "/s", "/c", "conda env list --json"]) : run("conda", ["env", "list", "--json"]),
    run("ffmpeg", ["-version"]),
    statfs(projectRoot),
    Promise.all(REQUIRED_MODEL_FILES.map((file) => isFile(join(modelRoot, file)))),
  ]);
  const [gpuName = "", gpuMemory = "0"] = gpuOutput.split(",").map((value) => value.trim());
  let condaEnvironments = [];
  try { condaEnvironments = JSON.parse(condaOutput).envs ?? []; } catch {}
  const dedicatedEnvPresent = condaEnvironments.some((path) => /[/\\]envs[/\\](?:zhihui-)?musetalk$/i.test(path));
  return assessMuseTalkInstallPreflight({
    gpuName,
    gpuMemoryMiB: Number(gpuMemory),
    freeBytes: Number(disk.bavail) * Number(disk.bsize),
    condaInstalled: Boolean(condaOutput),
    dedicatedEnvPresent,
    currentPython: pythonOutput.replace(/^Python\s+/i, ""),
    ffmpegReady: /^ffmpeg version/i.test(ffmpegOutput),
    requiredModelFiles: REQUIRED_MODEL_FILES.length,
    presentModelFiles: modelChecks.filter(Boolean).length,
  });
}
