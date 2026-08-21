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

function assetManifest(assets) {
  return assets.map(({ platform, cardIndex, role, filename, copyFingerprint, svgFingerprint, svgBytes }) => ({
    platform,
    cardIndex,
    role,
    filename,
    copyFingerprint,
    svgFingerprint,
    svgBytes,
  }));
}

function safeRenderResult(value) {
  if (
    value?.status !== "platform_text_visual_svg_render_ready"
    || !HASH.test(value?.sourceAssetPlanFingerprint ?? "")
    || !HASH.test(value?.renderFingerprint ?? "")
    || !Array.isArray(value?.assets)
    || value.assets.length < 1
    || value.assets.length > 18
    || value.assetsRendered !== value.assets.length
    || value?.filesWritten !== false
    || !Array.isArray(value?.generatedFiles)
    || value.generatedFiles.length !== 0
    || value?.visualPreviewReady !== true
    || value?.readyForHumanVisualReview !== true
    || value?.humanVisualReviewRequired !== true
    || value?.visualAssetsReady !== false
    || value?.assetUploadReady !== false
    || value?.readyForDraftHandoff !== false
    || value?.browserOpenPerformed !== false
    || value?.databaseWrites !== false
    || value?.modelCalls !== 0
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

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
      || asset.mimeType !== "image/svg+xml"
      || asset.width !== canvas.width
      || asset.height !== canvas.height
      || !HASH.test(asset.copyFingerprint ?? "")
      || !HASH.test(asset.svgFingerprint ?? "")
      || typeof asset.svg !== "string"
      || !asset.svg.startsWith("<svg ")
      || !asset.svg.endsWith("</svg>")
      || Buffer.byteLength(asset.svg, "utf8") !== asset.svgBytes
      || hash(asset.svg) !== asset.svgFingerprint
      || asset.renderStatus !== "svg_rendered_in_memory"
      || platformOrder < previousPlatform
      || platformOrder === previousPlatform && asset.cardIndex <= previousCardIndex
      || platformOrder !== previousPlatform && (asset.cardIndex !== 1 || asset.role !== "cover")
      || platformOrder === previousPlatform && (asset.cardIndex !== previousCardIndex + 1 || asset.role !== "body")
    ) return null;
    const encodedCopy = asset.svg.match(/data-exact-copy-base64url="([A-Za-z0-9_-]+)"/)?.[1];
    if (!encodedCopy) return null;
    const decodedCopy = Buffer.from(encodedCopy, "base64url").toString("utf8");
    if (hash(decodedCopy) !== asset.copyFingerprint) return null;
    filenames.add(asset.filename);
    previousPlatform = platformOrder;
    previousCardIndex = asset.cardIndex;
    assets.push(asset);
  }
  const manifest = assetManifest(assets);
  return hash({ sourceAssetPlanFingerprint: value.sourceAssetPlanFingerprint, assetManifest: manifest }) === value.renderFingerprint
    ? { assets, manifest }
    : null;
}

async function pathExists(fileSystem, path) {
  try {
    await fileSystem.stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_svg_bundle_export_blocked",
    blockers: [],
    authorizationRequired: true,
    expectedConfirmation: null,
    sourceRenderFingerprint: null,
    bundleManifestFingerprint: null,
    outputDirectory: null,
    recoveryDirectory: null,
    generatedFiles: [],
    filesWritten: false,
    filesystemMutations: false,
    visualBundleExported: false,
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

export async function exportPlatformTextSvgBundle(renderResult, options = {}) {
  const current = safeRenderResult(renderResult);
  if (!current) return safeResult({ blockers: ["platform_text_visual_svg_render_invalid_or_tampered"] });

  const expectedConfirmation = `EXPORT REVIEWED SVG BUNDLE ${renderResult.renderFingerprint}`;
  const common = {
    expectedConfirmation,
    sourceRenderFingerprint: renderResult.renderFingerprint,
  };
  if (options.confirmation !== expectedConfirmation) {
    return safeResult({ ...common, blockers: ["exact_local_svg_export_confirmation_required"] });
  }
  if (typeof options.workspaceRoot !== "string" || !isAbsolute(options.workspaceRoot)) {
    return safeResult({ ...common, blockers: ["absolute_workspace_root_required"] });
  }

  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const workspaceRoot = resolve(options.workspaceRoot);
  try {
    const packageJson = JSON.parse(await fileSystem.readFile(join(workspaceRoot, "package.json"), "utf8"));
    if (packageJson?.name !== PROJECT_NAME) {
      return safeResult({ ...common, blockers: ["workspace_project_identity_mismatch"] });
    }
  } catch (error) {
    return safeResult({ ...common, blockers: [`workspace_project_identity_unreadable:${errorCode(error)}`] });
  }

  const exportRoot = resolve(workspaceRoot, "work", "platform-text-visual-previews");
  const bundleName = renderResult.renderFingerprint;
  const destination = resolve(exportRoot, bundleName);
  const staging = resolve(exportRoot, `.staging-${bundleName}`);
  const failed = resolve(exportRoot, `.failed-${bundleName}`);
  const expectedPrefix = `${exportRoot}${sep}`;
  if (![destination, staging, failed].every((path) => path.startsWith(expectedPrefix))) {
    return safeResult({ ...common, blockers: ["local_svg_export_path_outside_workspace"] });
  }
  const outputDirectory = toPortablePath(relative(workspaceRoot, destination));

  let stagingCreated = false;
  try {
    await fileSystem.mkdir(exportRoot, { recursive: true });
    if (await pathExists(fileSystem, destination)) {
      return safeResult({ ...common, blockers: ["local_svg_bundle_destination_exists"], outputDirectory });
    }
    if (await pathExists(fileSystem, staging)) {
      return safeResult({ ...common, blockers: ["local_svg_bundle_staging_exists"], outputDirectory });
    }
    await fileSystem.mkdir(staging, { recursive: false });
    stagingCreated = true;

    for (const asset of current.assets) {
      await fileSystem.writeFile(join(staging, asset.filename), asset.svg, { encoding: "utf8", flag: "wx" });
    }
    const manifestCore = {
      schemaVersion: 1,
      bundleType: "platform_text_svg_visual_review",
      sourceAssetPlanFingerprint: renderResult.sourceAssetPlanFingerprint,
      renderFingerprint: renderResult.renderFingerprint,
      assets: current.manifest,
      humanVisualReview: { required: true, status: "pending", completed: false },
      platformDraft: { saved: false, published: false },
    };
    const bundleManifestFingerprint = hash(manifestCore);
    const bundleManifest = { ...manifestCore, bundleManifestFingerprint };
    const manifestText = `${JSON.stringify(bundleManifest, null, 2)}\n`;
    await fileSystem.writeFile(join(staging, "manifest.json"), manifestText, { encoding: "utf8", flag: "wx" });

    for (const asset of current.assets) {
      const written = await fileSystem.readFile(join(staging, asset.filename), "utf8");
      if (hash(written) !== asset.svgFingerprint) throw Object.assign(new Error("asset verification failed"), { code: "EVERIFY" });
    }
    const writtenManifest = JSON.parse(await fileSystem.readFile(join(staging, "manifest.json"), "utf8"));
    if (!sameManifest(writtenManifest, bundleManifest)) throw Object.assign(new Error("manifest verification failed"), { code: "EVERIFY" });

    await fileSystem.rename(staging, destination);
    const generatedFiles = [...current.assets.map(({ filename }) => `${outputDirectory}/${filename}`), `${outputDirectory}/manifest.json`];
    return safeResult({
      status: "platform_text_svg_bundle_export_ready_for_human_review",
      ...common,
      bundleManifestFingerprint,
      outputDirectory,
      generatedFiles,
      filesWritten: true,
      filesystemMutations: true,
      visualBundleExported: true,
      readyForHumanVisualReview: true,
    });
  } catch (error) {
    let recoveryDirectory = stagingCreated ? toPortablePath(relative(workspaceRoot, staging)) : null;
    let recoveryFailureCode = null;
    if (stagingCreated) {
      try {
        if (!await pathExists(fileSystem, failed)) {
          await fileSystem.rename(staging, failed);
          recoveryDirectory = toPortablePath(relative(workspaceRoot, failed));
        }
      } catch (recoveryError) {
        recoveryFailureCode = errorCode(recoveryError);
      }
    }
    return safeResult({
      ...common,
      blockers: [
        `local_svg_bundle_export_failed:${errorCode(error)}`,
        ...(recoveryFailureCode ? [`local_svg_bundle_recovery_failed:${recoveryFailureCode}`] : []),
      ],
      outputDirectory,
      recoveryDirectory,
      filesystemMutations: stagingCreated,
    });
  }
}

function sameManifest(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
