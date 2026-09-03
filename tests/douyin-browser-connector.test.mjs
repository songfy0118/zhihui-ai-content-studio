import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../browser-extension/zhihui-douyin-connector/", import.meta.url);

test("connector is restricted to the Zhihui site and official Douyin creator host", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.ok(manifest.host_permissions.includes("https://creator.douyin.com/*"));
  assert.ok(manifest.host_permissions.includes("https://zhihui-ai-studio.songfy0118.chatgpt.site/*"));
  assert.equal(manifest.host_permissions.some((value) => value === "<all_urls>"), false);
});

test("connector fills reviewed fields but contains no save or publish click", async () => {
  const [siteBridge, douyinFill] = await Promise.all([
    readFile(new URL("site-bridge.js", root), "utf8"),
    readFile(new URL("douyin-fill.js", root), "utf8"),
  ]);
  assert.match(siteBridge, /ZHIHUI_DOUYIN_HANDOFF_V1/);
  assert.match(douyinFill, /prefilled_review_pending/);
  assert.match(douyinFill, /draftSaved:false/);
  assert.match(douyinFill, /publishTriggered:false/);
  assert.doesNotMatch(douyinFill, /findText\("(?:保存|发布)"\)\.click/);
});

test("website handoff keeps the no-save and no-publish boundary", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /自动填入抖音（不发布）/);
  assert.match(page, /saveAllowed:false/);
  assert.match(page, /publishAllowed:false/);
  assert.match(page, /zhihui:douyin-handoff:v1/);
});
