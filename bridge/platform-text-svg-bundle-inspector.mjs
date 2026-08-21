import { createHash } from "node:crypto";
import * as nodeFileSystem from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const PLATFORM_CANVAS = Object.freeze({
  xiaohongshu: Object.freeze({ width: 1080, height: 1440 }),
  douyin: Object.freeze({ width: 1080, height: 1920 }),
});
const PROJECT_NAME = "zhihui-ai-content-studio";
const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function errorCode(error) {
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "unknown";
  return /^[a-z0-9_-]{1,40}$/.test(code) ? code : "unknown";
}

function toPortablePath(value) {
  return value.split(sep).join("/");
}

function safeManifest(value, requestedRenderFingerprint) {
  if (
    value?.schemaVersion !== 1
    || value?.bundleType !== "platform_text_svg_visual_review"
    || !HASH.test(value?.sourceAssetPlanFingerprint ?? "")
    || value?.renderFingerprint !== requestedRenderFingerprint
    || !HASH.test(value?.bundleManifestFingerprint ?? "")
    || !Array.isArray(value?.assets)
    || value.assets.length < 1
    || value.assets.length > 18
    || JSON.stringify(value?.humanVisualReview) !== JSON.stringify({ required: true, status: "pending", completed: false })
    || JSON.stringify(value?.platformDraft) !== JSON.stringify({ saved: false, published: false })
  ) return null;

  const { bundleManifestFingerprint, ...core } = value;
  if (hash(core) !== bundleManifestFingerprint) return null;

  const assets = [];
  const filenames = new Set();
  let previousPlatform = -1;
  let previousCardIndex = 0;
  for (const asset of value.assets) {
    const canvas = PLATFORM_CANVAS[asset?.platform];
    const platformOrder = PLATFORM_ORDER.get(asset?.platform);
    if (
      !canvas
      || platformOrder === undefined
      || !Number.isInteger(asset?.cardIndex)
      || asset.cardIndex < 1
      || asset.cardIndex > 9
      || !["cover", "body"].includes(asset?.role)
      || asset.filename !== `${asset.platform}-${String(asset.cardIndex).padStart(2, "0")}-${asset.role}.svg`
      || filenames.has(asset.filename)
      || !HASH.test(asset.copyFingerprint ?? "")
      || !HASH.test(asset.svgFingerprint ?? "")
      || !Number.isInteger(asset.svgBytes)
      || asset.svgBytes < 1
      || asset.svgBytes > MAX_SVG_BYTES
      || platformOrder < previousPlatform
      || platformOrder !== previousPlatform && (asset.cardIndex !== 1 || asset.role !== "cover")
      || platformOrder === previousPlatform && (asset.cardIndex !== previousCardIndex + 1 || asset.role !== "body")
    ) return null;
    filenames.add(asset.filename);
    previousPlatform = platformOrder;
    previousCardIndex = asset.cardIndex;
    assets.push({ ...asset, width: canvas.width, height: canvas.height });
  }
  return { ...value, assets };
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_svg_bundle_inspection_blocked",
    blockers: [],
    bundleFound: false,
    integrityStatus: "unverified",
    renderFingerprint: null,
    bundleManifestFingerprint: null,
    bundleDirectory: null,
    assets: [],
    fileReads: 0,
    filesystemMutations: false,
    readyForHumanVisualReview: false,
    humanVisualReviewRequired: true,
    visualAssetsReady: false,
    assetUploadReady: false,
    readyForDraftHandoff: false,
    browserOpenPerformed: false,
    databaseWrites: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export async function inspectPlatformTextSvgBundle(options = {}) {
  if (!HASH.test(options.renderFingerprint ?? "")) {
    return safeResult({ blockers: ["valid_render_fingerprint_required"] });
  }
  const common = { renderFingerprint: options.renderFingerprint };
  if (typeof options.workspaceRoot !== "string" || !isAbsolute(options.workspaceRoot)) {
    return safeResult({ ...common, blockers: ["absolute_workspace_root_required"] });
  }

  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const workspaceRoot = resolve(options.workspaceRoot);
  try {
    const packageJson = JSON.parse(await fileSystem.readFile(join(workspaceRoot, "package.json"), "utf8"));
    if (packageJson?.name !== PROJECT_NAME) {
      return safeResult({ ...common, blockers: ["workspace_project_identity_mismatch"], fileReads: 1 });
    }
  } catch (error) {
    return safeResult({ ...common, blockers: [`workspace_project_identity_unreadable:${errorCode(error)}`] });
  }

  const exportRoot = resolve(workspaceRoot, "work", "platform-text-visual-previews");
  const bundleDirectory = resolve(exportRoot, options.renderFingerprint);
  const portableBundleDirectory = toPortablePath(relative(workspaceRoot, bundleDirectory));
  if (!bundleDirectory.startsWith(`${exportRoot}${sep}`)) {
    return safeResult({ ...common, blockers: ["local_svg_bundle_path_outside_workspace"], fileReads: 1 });
  }

  let fileReads = 1;
  try {
    const directoryInfo = await fileSystem.lstat(bundleDirectory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      return safeResult({
        ...common,
        blockers: ["local_svg_bundle_directory_invalid"],
        bundleFound: true,
        bundleDirectory: portableBundleDirectory,
        fileReads,
      });
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return safeResult({
        ...common,
        status: "platform_text_svg_bundle_inspection_missing",
        blockers: ["local_svg_bundle_not_found"],
        bundleDirectory: portableBundleDirectory,
        fileReads,
      });
    }
    return safeResult({ ...common, blockers: [`local_svg_bundle_directory_unreadable:${errorCode(error)}`], fileReads });
  }

  try {
    const realWorkspace = await fileSystem.realpath(workspaceRoot);
    const realExportRoot = await fileSystem.realpath(exportRoot);
    const realBundle = await fileSystem.realpath(bundleDirectory);
    fileReads += 3;
    if (
      !realExportRoot.startsWith(`${realWorkspace}${sep}`)
      || !realBundle.startsWith(`${realExportRoot}${sep}`)
    ) {
      return safeResult({
        ...common,
        blockers: ["local_svg_bundle_real_path_outside_workspace"],
        bundleFound: true,
        bundleDirectory: portableBundleDirectory,
        fileReads,
      });
    }

    const manifestPath = join(bundleDirectory, "manifest.json");
    const manifestInfo = await fileSystem.lstat(manifestPath);
    fileReads += 1;
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size < 1 || manifestInfo.size > MAX_MANIFEST_BYTES) {
      return safeResult({
        ...common,
        blockers: ["local_svg_bundle_manifest_file_invalid"],
        bundleFound: true,
        bundleDirectory: portableBundleDirectory,
        fileReads,
      });
    }
    const manifest = safeManifest(JSON.parse(await fileSystem.readFile(manifestPath, "utf8")), options.renderFingerprint);
    fileReads += 1;
    if (!manifest) {
      return safeResult({
        ...common,
        blockers: ["local_svg_bundle_manifest_invalid_or_tampered"],
        bundleFound: true,
        bundleDirectory: portableBundleDirectory,
        fileReads,
      });
    }

    const entries = (await fileSystem.readdir(bundleDirectory)).sort();
    fileReads += 1;
    const expectedEntries = ["manifest.json", ...manifest.assets.map(({ filename }) => filename)].sort();
    if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
      return safeResult({
        ...common,
        blockers: ["local_svg_bundle_file_set_mismatch"],
        bundleFound: true,
        bundleDirectory: portableBundleDirectory,
        bundleManifestFingerprint: manifest.bundleManifestFingerprint,
        fileReads,
      });
    }

    const inspectedAssets = [];
    for (const asset of manifest.assets) {
      const assetPath = join(bundleDirectory, asset.filename);
      const assetInfo = await fileSystem.lstat(assetPath);
      fileReads += 1;
      if (!assetInfo.isFile() || assetInfo.isSymbolicLink() || assetInfo.size !== asset.svgBytes || assetInfo.size > MAX_SVG_BYTES) {
        return safeResult({
          ...common,
          blockers: [`local_svg_asset_file_invalid:${asset.filename}`],
          bundleFound: true,
          bundleDirectory: portableBundleDirectory,
          bundleManifestFingerprint: manifest.bundleManifestFingerprint,
          fileReads,
        });
      }
      const svg = await fileSystem.readFile(assetPath, "utf8");
      fileReads += 1;
      const encodedCopy = svg.match(/data-exact-copy-base64url="([A-Za-z0-9_-]+)"/)?.[1];
      const decodedCopy = encodedCopy ? Buffer.from(encodedCopy, "base64url").toString("utf8") : null;
      const dimensionsMatch = svg.includes(`width="${asset.width}"`) && svg.includes(`height="${asset.height}"`);
      if (
        Buffer.byteLength(svg, "utf8") !== asset.svgBytes
        || hash(svg) !== asset.svgFingerprint
        || !decodedCopy
        || hash(decodedCopy) !== asset.copyFingerprint
        || !dimensionsMatch
      ) {
        return safeResult({
          ...common,
          blockers: [`local_svg_asset_integrity_failed:${asset.filename}`],
          bundleFound: true,
          bundleDirectory: portableBundleDirectory,
          bundleManifestFingerprint: manifest.bundleManifestFingerprint,
          fileReads,
        });
      }
      inspectedAssets.push({
        platform: asset.platform,
        cardIndex: asset.cardIndex,
        role: asset.role,
        filename: asset.filename,
        width: asset.width,
        height: asset.height,
        svgBytes: asset.svgBytes,
        copyFingerprint: asset.copyFingerprint,
        svgFingerprint: asset.svgFingerprint,
        exactCopyMetadataVerified: true,
        integrityVerified: true,
      });
    }

    return safeResult({
      status: "platform_text_svg_bundle_inspection_ready",
      blockers: [],
      bundleFound: true,
      integrityStatus: "verified_pending_human_visual_review",
      renderFingerprint: options.renderFingerprint,
      bundleManifestFingerprint: manifest.bundleManifestFingerprint,
      bundleDirectory: portableBundleDirectory,
      assets: inspectedAssets,
      fileReads,
      readyForHumanVisualReview: true,
    });
  } catch (error) {
    return safeResult({
      ...common,
      blockers: [`local_svg_bundle_inspection_failed:${errorCode(error)}`],
      bundleFound: true,
      bundleDirectory: portableBundleDirectory,
      fileReads,
    });
  }
}
