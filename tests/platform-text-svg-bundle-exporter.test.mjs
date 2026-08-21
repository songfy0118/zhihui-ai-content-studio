import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { exportPlatformTextSvgBundle } from "../bridge/platform-text-svg-bundle-exporter.mjs";

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
  const root = await fileSystem.mkdtemp(join(tmpdir(), "zhihui-svg-export-"));
  await fileSystem.writeFile(join(root, "package.json"), JSON.stringify({ name: "zhihui-ai-content-studio" }), "utf8");
  t.after(() => fileSystem.rm(root, { recursive: true, force: true }));
  return root;
}

test("requires the exact render-bound confirmation before creating directories", async (t) => {
  const root = await workspace(t);
  const render = readyRender();
  const result = await exportPlatformTextSvgBundle(render, { workspaceRoot: root });

  assert.deepEqual(result.blockers, ["exact_local_svg_export_confirmation_required"]);
  assert.equal(result.expectedConfirmation, `EXPORT REVIEWED SVG BUNDLE ${render.renderFingerprint}`);
  assert.equal(result.filesystemMutations, false);
  await assert.rejects(fileSystem.stat(join(root, "work")), { code: "ENOENT" });
});

test("exports verified SVG files and a pending-review manifest without overwriting", async (t) => {
  const root = await workspace(t);
  const render = readyRender();
  const confirmation = `EXPORT REVIEWED SVG BUNDLE ${render.renderFingerprint}`;
  const result = await exportPlatformTextSvgBundle(render, { workspaceRoot: root, confirmation });

  assert.equal(result.status, "platform_text_svg_bundle_export_ready_for_human_review");
  assert.equal(result.filesWritten, true);
  assert.equal(result.visualBundleExported, true);
  assert.equal(result.generatedFiles.length, 3);
  const destination = join(root, ...result.outputDirectory.split("/"));
  for (const asset of render.assets) {
    assert.equal(await fileSystem.readFile(join(destination, asset.filename), "utf8"), asset.svg);
  }
  const manifest = JSON.parse(await fileSystem.readFile(join(destination, "manifest.json"), "utf8"));
  assert.equal(manifest.renderFingerprint, render.renderFingerprint);
  assert.deepEqual(manifest.humanVisualReview, { required: true, status: "pending", completed: false });
  assert.deepEqual(manifest.platformDraft, { saved: false, published: false });
  assert.equal(manifest.bundleManifestFingerprint, result.bundleManifestFingerprint);

  const replay = await exportPlatformTextSvgBundle(render, { workspaceRoot: root, confirmation });
  assert.deepEqual(replay.blockers, ["local_svg_bundle_destination_exists"]);
  assert.equal(replay.filesWritten, false);
});

test("rejects tampered renders and an unrelated workspace before writing", async (t) => {
  const root = await workspace(t);
  const render = readyRender();
  render.assets[0].svg += "篡改";
  assert.deepEqual(
    (await exportPlatformTextSvgBundle(render, { workspaceRoot: root })).blockers,
    ["platform_text_visual_svg_render_invalid_or_tampered"],
  );

  const unrelated = await fileSystem.mkdtemp(join(tmpdir(), "unrelated-svg-export-"));
  t.after(() => fileSystem.rm(unrelated, { recursive: true, force: true }));
  await fileSystem.writeFile(join(unrelated, "package.json"), JSON.stringify({ name: "another-project" }), "utf8");
  const fresh = readyRender();
  const confirmation = `EXPORT REVIEWED SVG BUNDLE ${fresh.renderFingerprint}`;
  assert.deepEqual(
    (await exportPlatformTextSvgBundle(fresh, { workspaceRoot: unrelated, confirmation })).blockers,
    ["workspace_project_identity_mismatch"],
  );
});

test("preserves a failed staging bundle for diagnosis instead of reporting success", async (t) => {
  const root = await workspace(t);
  const render = readyRender();
  const confirmation = `EXPORT REVIEWED SVG BUNDLE ${render.renderFingerprint}`;
  let writes = 0;
  const failingFileSystem = {
    ...fileSystem,
    async writeFile(...args) {
      writes += 1;
      if (writes === 2) throw Object.assign(new Error("simulated write failure"), { code: "EIO" });
      return fileSystem.writeFile(...args);
    },
  };
  const result = await exportPlatformTextSvgBundle(render, {
    workspaceRoot: root,
    confirmation,
    fileSystem: failingFileSystem,
  });

  assert.deepEqual(result.blockers, ["local_svg_bundle_export_failed:eio"]);
  assert.equal(result.filesWritten, false);
  assert.equal(result.visualBundleExported, false);
  assert.ok(result.recoveryDirectory.startsWith("work/platform-text-visual-previews/.failed-"));
  assert.equal((await fileSystem.stat(join(root, ...result.recoveryDirectory.split("/")))).isDirectory(), true);
});

test("keeps human review, platform drafts and publication closed after local export", async (t) => {
  const root = await workspace(t);
  const render = readyRender();
  const result = await exportPlatformTextSvgBundle(render, {
    workspaceRoot: root,
    confirmation: `EXPORT REVIEWED SVG BUNDLE ${render.renderFingerprint}`,
  });

  assert.equal(result.readyForHumanVisualReview, true);
  assert.equal(result.humanVisualReviewRequired, true);
  assert.equal(result.visualAssetsReady, false);
  assert.equal(result.assetUploadReady, false);
  assert.equal(result.readyForDraftHandoff, false);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("remains disconnected from routes and the executable Xiaohongshu pilot", async () => {
  const routes = await Promise.all([
    fileSystem.readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    fileSystem.readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
    fileSystem.readFile(new URL("../bridge/social-draft-handoff.mjs", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((content) => !content.includes("platform-text-svg-bundle-exporter")));
});
