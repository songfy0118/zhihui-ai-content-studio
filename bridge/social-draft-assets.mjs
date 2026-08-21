import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".png", ".jpg", ".jpeg", ".webp"]);

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function inspectSocialDraftAssets({ projectRoot, mediaPaths, coverPath = null } = {}) {
  const blockers = [];
  const root = resolve(projectRoot ?? ".");
  const allowedRoot = join(root, "work", "packages");
  let allowedRootReal;
  try {
    allowedRootReal = await realpath(allowedRoot);
  } catch {
    return {
      verified: false,
      status: "blocked",
      blockers: ["package_root_missing"],
      assetFingerprint: null,
      assets: [],
      allowedRoot: "work/packages",
      fileContentsReturned: false,
      externalCalls: false,
      uploadTriggered: false,
      publishTriggered: false,
    };
  }

  const candidates = [
    ...(Array.isArray(mediaPaths) ? mediaPaths.map((path) => ({ role: "media", path })) : []),
    ...(typeof coverPath === "string" && coverPath.trim() ? [{ role: "cover", path: coverPath }] : []),
  ];
  if (!candidates.some(({ role }) => role === "media")) blockers.push("media_missing");

  const assets = [];
  for (const [index, candidate] of candidates.entries()) {
    if (typeof candidate.path !== "string" || !candidate.path.trim()) {
      blockers.push(`asset_${index}_path_invalid`);
      continue;
    }
    const requested = resolve(root, candidate.path.trim());
    if (!inside(allowedRoot, requested)) {
      blockers.push(`asset_${index}_outside_package_root`);
      continue;
    }
    let actual;
    try {
      actual = await realpath(requested);
    } catch {
      blockers.push(`asset_${index}_missing`);
      continue;
    }
    if (!inside(allowedRootReal, actual)) {
      blockers.push(`asset_${index}_outside_package_root`);
      continue;
    }
    const fileStat = await stat(actual);
    if (!fileStat.isFile()) {
      blockers.push(`asset_${index}_not_file`);
      continue;
    }
    const extension = extname(actual).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      blockers.push(`asset_${index}_type_not_allowed`);
      continue;
    }
    assets.push({
      role: candidate.role,
      path: relative(allowedRootReal, actual).replaceAll("\\", "/"),
      extension,
      sizeBytes: fileStat.size,
      sha256: await sha256File(actual),
    });
  }

  const assetFingerprint = blockers.length === 0
    ? createHash("sha256").update(JSON.stringify(assets)).digest("hex")
    : null;
  return {
    verified: blockers.length === 0,
    status: blockers.length === 0 ? "verified" : "blocked",
    blockers,
    assetFingerprint,
    assets,
    allowedRoot: "work/packages",
    fileContentsReturned: false,
    externalCalls: false,
    uploadTriggered: false,
    publishTriggered: false,
  };
}

