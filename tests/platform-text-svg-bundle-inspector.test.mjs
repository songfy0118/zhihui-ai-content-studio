import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { exportPlatformTextSvgBundle } from "../bridge/platform-text-svg-bundle-exporter.mjs";
import { inspectPlatformTextSvgBundle } from "../bridge/platform-text-svg-bundle-inspector.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function asset(platform) {
  const copy = JSON.stringify({ primaryText: `${platform}封面`, secondaryText: "双来源核验示例" });
  const encodedCopy = Buffer.from(copy, "utf8").toString("base64url");
  const copyFingerprint = hash(copy);
  const width = 1080;
  const height = platform === "xiaohongshu" ? 1440 : 1920;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" data-exact-copy-base64url="${encodedCopy}" data-copy-sha256="${copyFingerprint}"><text>已审核模拟文案</text></svg>`;
  return {
    platform,
    cardIndex: 1,
    role: "cover",
    filename: `${platform}-01-cover.svg`,
    mimeType: "image/svg+xml",
    width,
    height,
    copyFingerprint,
    svgFingerprint: hash(svg),
    svgBytes: Buffer.byteLength(svg, "utf8"),
    svg,
    renderStatus: "svg_rendered_in_memory",
  };
}

function readyRender() {
  const sourceAssetPlanFingerprint = "a".repeat(64);
  const assets = [asset("xiaohongshu"), asset("douyin")];
  const assetManifest = assets.map(({ platform, cardIndex, role, filename, copyFingerprint, svgFingerprint, svgBytes }) => ({
    platform,
    cardIndex,
    role,
    filename,
    copyFingerprint,
    svgFingerprint,
    svgBytes,
  }));
  return {
    status: "platform_text_visual_svg_render_ready",
    blockers: [],
    sourceAssetPlanFingerprint,
    renderFingerprint: hash({ sourceAssetPlanFingerprint, assetManifest }),
    assets,
    assetsRendered: assets.length,
    filesWritten: false,
    generatedFiles: [],
    visualPreviewReady: true,
    readyForHumanVisualReview: true,
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
  };
}

async function workspace(t) {
  const root = await fileSystem.mkdtemp(join(tmpdir(), "zhihui-svg-inspect-"));
  await fileSystem.writeFile(join(root, "package.json"), JSON.stringify({ name: "zhihui-ai-content-studio" }), "utf8");
  t.after(() => fileSystem.rm(root, { recursive: true, force: true }));
  return root;
}

async function exportedBundle(t) {
  const root = await workspace(t);
  const render = readyRender();
  const exported = await exportPlatformTextSvgBundle(render, {
    workspaceRoot: root,
    confirmation: `EXPORT REVIEWED SVG BUNDLE ${render.renderFingerprint}`,
  });
  assert.equal(exported.status, "platform_text_svg_bundle_export_ready_for_human_review");
  return {
    root,
    render,
    destination: join(root, ...exported.outputDirectory.split("/")),
  };
}

test("reports a missing bundle without creating files", async (t) => {
  const root = await workspace(t);
  const render = readyRender();
  const result = await inspectPlatformTextSvgBundle({ workspaceRoot: root, renderFingerprint: render.renderFingerprint });

  assert.equal(result.status, "platform_text_svg_bundle_inspection_missing");
  assert.deepEqual(result.blockers, ["local_svg_bundle_not_found"]);
  assert.equal(result.bundleFound, false);
  assert.equal(result.filesystemMutations, false);
  await assert.rejects(fileSystem.stat(join(root, "work")), { code: "ENOENT" });
});

test("verifies a complete exported bundle while keeping human review pending", async (t) => {
  const { root, render } = await exportedBundle(t);
  const result = await inspectPlatformTextSvgBundle({ workspaceRoot: root, renderFingerprint: render.renderFingerprint });

  assert.equal(result.status, "platform_text_svg_bundle_inspection_ready");
  assert.equal(result.integrityStatus, "verified_pending_human_visual_review");
  assert.equal(result.assets.length, 2);
  assert.ok(result.assets.every((item) => item.integrityVerified && item.exactCopyMetadataVerified));
  assert.ok(result.assets.every((item) => !("svg" in item) && !("exactCopy" in item)));
  assert.equal(result.readyForHumanVisualReview, true);
  assert.equal(result.humanVisualReviewRequired, true);
  assert.equal(result.visualAssetsReady, false);
  assert.equal(result.assetUploadReady, false);
  assert.equal(result.readyForDraftHandoff, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("rejects an SVG whose bytes were changed after export", async (t) => {
  const { root, render, destination } = await exportedBundle(t);
  const target = join(destination, render.assets[0].filename);
  const original = await fileSystem.readFile(target, "utf8");
  await fileSystem.writeFile(target, original.replace("已审核", "待审核"), "utf8");

  const result = await inspectPlatformTextSvgBundle({ workspaceRoot: root, renderFingerprint: render.renderFingerprint });
  assert.deepEqual(result.blockers, [`local_svg_asset_integrity_failed:${render.assets[0].filename}`]);
  assert.equal(result.integrityStatus, "unverified");
  assert.equal(result.readyForHumanVisualReview, false);
});

test("rejects unexpected files in the exported bundle", async (t) => {
  const { root, render, destination } = await exportedBundle(t);
  await fileSystem.writeFile(join(destination, "unexpected.txt"), "not part of the manifest", "utf8");

  const result = await inspectPlatformTextSvgBundle({ workspaceRoot: root, renderFingerprint: render.renderFingerprint });
  assert.deepEqual(result.blockers, ["local_svg_bundle_file_set_mismatch"]);
  assert.equal(result.readyForHumanVisualReview, false);
});

test("rejects a manifest that claims the platform draft was saved", async (t) => {
  const { root, render, destination } = await exportedBundle(t);
  const manifestPath = join(destination, "manifest.json");
  const manifest = JSON.parse(await fileSystem.readFile(manifestPath, "utf8"));
  manifest.platformDraft.saved = true;
  await fileSystem.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result = await inspectPlatformTextSvgBundle({ workspaceRoot: root, renderFingerprint: render.renderFingerprint });
  assert.deepEqual(result.blockers, ["local_svg_bundle_manifest_invalid_or_tampered"]);
  assert.equal(result.readyForHumanVisualReview, false);
});

test("uses read-only filesystem operations and remains disconnected from routes", async () => {
  const source = await fileSystem.readFile(new URL("../bridge/platform-text-svg-bundle-inspector.mjs", import.meta.url), "utf8");
  for (const operation of ["writeFile(", "mkdir(", "rename(", "rm(", "unlink("]) {
    assert.equal(source.includes(operation), false, `unexpected filesystem mutation: ${operation}`);
  }
  const routes = await Promise.all([
    fileSystem.readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    fileSystem.readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
    fileSystem.readFile(new URL("../bridge/social-draft-handoff.mjs", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((content) => !content.includes("platform-text-svg-bundle-inspector")));
});
