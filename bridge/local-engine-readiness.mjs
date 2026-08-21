import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { inspectLumenXConfiguration } from "./lumenx-configuration.mjs";

async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

async function allFiles(root, files) {
  const checks = await Promise.all(files.map((file) => isFile(join(root, file))));
  return checks.every(Boolean);
}

async function inspectCosyVoice(vendorRoot) {
  const root = join(vendorRoot, "CosyVoice");
  const codePresent = await allFiles(root, ["README.md", "webui.py", "cosyvoice/cli/cosyvoice.py"]);
  const modelsRoot = join(root, "pretrained_models");
  const modelDirs = await readdir(modelsRoot, { withFileTypes: true }).catch(() => []);
  let modelReady = false;
  for (const entry of modelDirs.filter((item) => item.isDirectory())) {
    const modelRoot = join(modelsRoot, entry.name);
    const weights = await allFiles(modelRoot, ["llm.pt", "flow.pt", "hift.pt", "campplus.onnx"]);
    const config = await Promise.all(["cosyvoice.yaml", "cosyvoice2.yaml"].map((file) => isFile(join(modelRoot, file))));
    if (weights && config.some(Boolean)) { modelReady = true; break; }
  }
  return {
    id: "cosyvoice", name: "CosyVoice", role: "中文本地配音", codePresent, modelReady,
    ready: codePresent && modelReady,
    status: !codePresent ? "code_missing" : modelReady ? "ready" : "model_weights_missing",
    detail: !codePresent ? "代码不完整" : modelReady ? "代码与推理权重齐全；尚未生成测试音频" : "代码已存在，但 pretrained_models 中没有完整推理权重",
    action: modelReady ? "下一步只生成 1 句测试旁白" : "下载权重属于大文件联网操作，需要单独确认",
    downloadRequired: !modelReady,
  };
}

async function inspectMuseTalk(vendorRoot) {
  const root = join(vendorRoot, "MuseTalk");
  const codePresent = await allFiles(root, ["README.md", "app.py", "musetalk/utils/utils.py"]);
  const requiredWeights = [
    "models/musetalkV15/musetalk.json", "models/musetalkV15/unet.pth",
    "models/syncnet/latentsync_syncnet.pt", "models/dwpose/dw-ll_ucoco_384.pth",
    "models/face-parse-bisent/79999_iter.pth", "models/face-parse-bisent/resnet18-5c106cde.pth",
    "models/sd-vae/config.json", "models/sd-vae/diffusion_pytorch_model.bin", "models/whisper/pytorch_model.bin",
  ];
  const weightChecks = await Promise.all(requiredWeights.map((file) => isFile(join(root, file))));
  const modelReady = weightChecks.every(Boolean);
  return {
    id: "musetalk", name: "MuseTalk", role: "数字人口型备选", codePresent, modelReady,
    ready: codePresent && modelReady,
    status: !codePresent ? "code_missing" : modelReady ? "ready" : "model_weights_missing",
    detail: !codePresent ? "代码不完整" : modelReady ? "代码与九项必要权重齐全；尚未运行推理" : `代码已存在，必要权重 ${weightChecks.filter(Boolean).length}/${requiredWeights.length}`,
    action: modelReady ? "仅在数字人路线需要时运行测试" : "下载权重属于大文件联网操作，需要单独确认",
    downloadRequired: !modelReady,
  };
}

async function inspectCodeEngine(vendorRoot, spec) {
  const codePresent = await allFiles(join(vendorRoot, spec.directory), spec.markers);
  return {
    id: spec.id, name: spec.name, role: spec.role, codePresent, modelReady: false, ready: false,
    status: codePresent ? "external_configuration_required" : "code_missing",
    detail: codePresent ? spec.detail : "代码不完整",
    action: codePresent ? spec.action : "重新拉取仓库前需要检查本地改动",
    downloadRequired: false,
  };
}

async function inspectLumenX(vendorRoot) {
  const root = join(vendorRoot, "lumenx");
  const codePresent = await allFiles(root, ["README.md", "main.py", "pyproject.toml"]);
  const configuration = await inspectLumenXConfiguration(root);
  return {
    id: "lumenx", name: "LumenX", role: "漫剧候选主引擎", codePresent, modelReady: false,
    ready: codePresent && configuration.readyForPilot,
    status: !codePresent ? "code_missing" : configuration.status,
    detail: !codePresent ? "代码不完整" : configuration.readyForPilot ? "基础模型配置存在，但尚未运行付费验证" : "代码完整；DashScope 基础路线尚未配置",
    action: codePresent ? configuration.nextAction : "重新拉取仓库前需要检查本地改动",
    downloadRequired: false,
    configuration,
  };
}

export async function inspectLocalEngines(projectRoot, fetcher = fetch) {
  const vendorRoot = join(projectRoot, "vendor");
  const localMiniDramaRoot = join(vendorRoot, "LocalMiniDrama");
  const localMiniDramaCode = await allFiles(localMiniDramaRoot, ["README.md", "backend-node/package.json", "frontweb/package.json"]);
  let localMiniDramaRunning = false;
  try {
    const response = await fetcher("http://127.0.0.1:5679/health", { signal: AbortSignal.timeout(2000) });
    localMiniDramaRunning = response.ok;
  } catch {}

  return {
    checkedAt: new Date().toISOString(), automaticDownloads: false,
    engines: [
      {
        id: "localminidrama", name: "LocalMiniDrama", role: "本机主工作台",
        codePresent: localMiniDramaCode, modelReady: true, ready: localMiniDramaCode && localMiniDramaRunning,
        status: !localMiniDramaCode ? "code_missing" : localMiniDramaRunning ? "ready" : "runtime_offline",
        detail: localMiniDramaRunning ? "代码完整且本机后端在线" : "代码存在，但本机后端未在线",
        action: localMiniDramaRunning ? "继续配置上游模型服务" : "运行本机启动脚本",
        downloadRequired: false, url: "http://127.0.0.1:3013",
      },
      await inspectLumenX(vendorRoot),
      await inspectCodeEngine(vendorRoot, { id: "moneyprinter", name: "MoneyPrinterTurbo", role: "资讯口播备选", directory: "MoneyPrinterTurbo", markers: ["README.md", "main.py", "webui.bat"], detail: "代码完整，但素材与文本服务尚未配置", action: "需要时再选择合法素材源与模型服务" }),
      await inspectCosyVoice(vendorRoot),
      await inspectMuseTalk(vendorRoot),
    ],
  };
}
