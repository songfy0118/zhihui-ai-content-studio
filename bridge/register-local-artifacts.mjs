import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { classifyArtifactForProduction, REQUIRED_ARTIFACTS } from "./production-readiness.mjs";
import { sha256 } from "./package-readiness.mjs";

function isInside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function safeExtension(value, fallback) {
  const extension = extname(new URL(value, "http://localhost").pathname).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(extension) ? extension : fallback;
}

async function writeDownloadedArtifact(url, destination, fetcher) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "5679") {
    throw new Error("Only LocalMiniDrama loopback artifact URLs are allowed");
  }
  const response = await fetcher(parsed);
  if (!response.ok) throw new Error(`LocalMiniDrama artifact download failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("LocalMiniDrama artifact is empty");
  const temporary = `${destination}.partial`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function materializeCandidate(candidate, destination, storageRoots, fetcher) {
  const productionPolicy = classifyArtifactForProduction({ file: candidate });
  if (!productionPolicy.eligibleForProduction) {
    throw new Error("Smoke/test artifacts cannot be registered as production media");
  }
  if (/^https?:\/\//i.test(candidate)) {
    await writeDownloadedArtifact(candidate, destination, fetcher);
    return;
  }
  let source = candidate.replace(/^[/\\]+static[/\\]+/i, "");
  if (!isAbsolute(source)) {
    source = storageRoots
      .map((root) => ({ root, target: resolve(root, source) }))
      .find(({ root, target }) => isInside(root, target))?.target;
  }
  if (!source || !isAbsolute(source) || !storageRoots.some((root) => isInside(root, source))) {
    throw new Error("LocalMiniDrama artifact path is outside approved storage roots");
  }
  const sourceStat = await stat(source);
  if (!sourceStat.isFile() || sourceStat.size === 0) throw new Error("LocalMiniDrama artifact is missing or empty");
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

export async function registerLocalMiniDramaArtifacts({
  manifestPath,
  engineOutputs,
  storageRoots = [],
  fetcher = fetch,
}) {
  const resolvedManifest = resolve(manifestPath);
  const packageRoot = dirname(resolvedManifest);
  const manifest = JSON.parse(await readFile(resolvedManifest, "utf8"));
  const artifacts = Array.isArray(manifest.artifacts) ? [...manifest.artifacts] : [];
  const registered = [];

  const subtitleFile = manifest.subtitle_file;
  if (typeof subtitleFile === "string") {
    const subtitlePath = resolve(packageRoot, subtitleFile);
    if (!isAbsolute(subtitleFile) && isInside(packageRoot, subtitlePath)) {
      const subtitleStat = await stat(subtitlePath).catch(() => null);
      if (subtitleStat?.isFile() && subtitleStat.size > 0) {
        registered.push({ kind: "subtitles", file: subtitleFile.replaceAll("\\", "/"), sha256: await sha256(subtitlePath), source: "zhihui-package" });
      }
    }
  }

  const videoCandidate = engineOutputs?.candidates?.finalVideos?.[0]?.url
    ?? engineOutputs?.candidates?.completedMerges?.[0]?.url;
  if (typeof videoCandidate === "string" && videoCandidate) {
    const videoFile = `media/final${safeExtension(videoCandidate, ".mp4")}`;
    await materializeCandidate(videoCandidate, resolve(packageRoot, videoFile), storageRoots, fetcher);
    registered.push({ kind: "video", file: videoFile, sha256: await sha256(resolve(packageRoot, videoFile)), source: "LocalMiniDrama" });
  }

  const audioCandidates = Array.isArray(engineOutputs?.candidates?.audioFiles) ? engineOutputs.candidates.audioFiles : [];
  for (const [index, candidate] of audioCandidates.entries()) {
    if (typeof candidate !== "string" || !candidate) continue;
    const originalName = basename(candidate).replace(/[^a-zA-Z0-9._-]/g, "-");
    const audioFile = `media/audio-${String(index + 1).padStart(3, "0")}-${originalName || `track${safeExtension(candidate, ".wav")}`}`;
    await materializeCandidate(candidate, resolve(packageRoot, audioFile), storageRoots, fetcher);
    registered.push({ kind: "audio", file: audioFile, sha256: await sha256(resolve(packageRoot, audioFile)), source: "LocalMiniDrama" });
  }

  for (const artifact of registered) {
    const existingIndex = artifacts.findIndex((item) => item.kind === artifact.kind && item.file === artifact.file);
    if (existingIndex === -1) artifacts.push(artifact);
    else artifacts[existingIndex] = artifact;
  }

  const verifiedKinds = await Promise.all(artifacts.map(async (artifact) => {
    if (typeof artifact.file !== "string" || isAbsolute(artifact.file) || !/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? "")) return null;
    if (!classifyArtifactForProduction(artifact).eligibleForProduction) return null;
    const target = resolve(packageRoot, artifact.file);
    if (!isInside(packageRoot, target)) return null;
    try {
      return await sha256(target) === artifact.sha256.toLowerCase() ? artifact.kind : null;
    } catch {
      return null;
    }
  }));
  const availableKinds = new Set(verifiedKinds.filter(Boolean));
  const nextManifest = {
    ...manifest,
    media_status: REQUIRED_ARTIFACTS.every((kind) => availableKinds.has(kind)) ? "ready_for_review" : "waiting_for_generation",
    artifacts,
  };
  const changed = JSON.stringify(manifest) !== JSON.stringify(nextManifest);
  if (changed) await writeFile(resolvedManifest, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");

  return {
    changed,
    registered,
    missingKinds: REQUIRED_ARTIFACTS.filter((kind) => !availableKinds.has(kind)),
    mediaStatus: nextManifest.media_status,
  };
}
