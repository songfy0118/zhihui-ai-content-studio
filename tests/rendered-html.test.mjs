import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("ships the finished content operations dashboard", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /知绘工厂/);
  assert.match(page, /今日选题/);
  assert.match(page, /生成队列/);
  assert.match(page, /审核发布/);
  assert.match(page, /数据学习/);
  assert.match(page, /交给本机引擎/);
  assert.match(page, /\/api\/local\/generate/);
  assert.match(layout, /知绘工厂/);
  assert.match(css, /\.localProjects/);
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});

test("protects and wires the LocalMiniDrama adapter", async () => {
  const [healthRoute, generateRoute, projectsRoute, preflightRoute, launcher] = await Promise.all([
    readFile(new URL("../app/api/local/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/generate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/projects/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/preflight/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../start-local-studio.ps1", import.meta.url), "utf8"),
  ]);

  assert.match(healthRoute, /127\.0\.0\.1/);
  assert.match(healthRoute, /\/api\/v1\/ai-configs/);
  assert.match(generateRoute, /\/api\/v1\/dramas/);
  assert.match(generateRoute, /\/api\/v1\/generation\/story/);
  assert.match(generateRoute, /source_idea_id === idea\.id/);
  assert.match(generateRoute, /只能从本机操作台执行/);
  assert.match(projectsRoute, /zhihui-content-os/);
  assert.match(preflightRoute, /"text"/);
  assert.match(preflightRoute, /"image"/);
  assert.match(preflightRoute, /"video"/);
  assert.match(preflightRoute, /"tts"/);
  assert.match(launcher, /LocalMiniDrama/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:3000/);
});

test("keeps the pilot packaging fact-gated and human-reviewed", async () => {
  const [packager, pilot] = await Promise.all([
    readFile(new URL("../scripts/build-delivery-package.mjs", import.meta.url), "utf8"),
    readFile(new URL("../examples/octopus-pilot.json", import.meta.url), "utf8"),
  ]);
  assert.match(packager, /Fact review must be completed before packaging/);
  assert.match(packager, /requires_human_review:\s*true/);
  assert.match(packager, /media_status:\s*"waiting_for_generation"/);
  assert.match(pilot, /"douyin"/);
  assert.match(pilot, /"tiktok"/);
  assert.match(pilot, /"xiaohongshu"/);
});
