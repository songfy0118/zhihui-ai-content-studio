import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { inspectPackageReadiness } from "./package-readiness.mjs";
import { getLocalMiniDramaPilotInput, inspectLocalMiniDramaOutputs } from "./local-mini-drama-artifacts.mjs";
import { registerLocalMiniDramaArtifacts } from "./register-local-artifacts.mjs";
import { inspectLocalEngines } from "./local-engine-readiness.mjs";
import { inspectCosyVoiceInstallPreflight } from "./cosyvoice-install-preflight.mjs";
import { inspectMuseTalkInstallPreflight } from "./musetalk-install-preflight.mjs";
import { inspectMoneyPrinterPreflight } from "./moneyprinter-preflight.mjs";
import { BRIDGE_CAPABILITIES, BRIDGE_PROTOCOL_VERSION } from "./protocol.mjs";
import { buildGenerationPlan } from "./generation-plan.mjs";
import { buildLumenXPilotPlan, summarizeLumenXPilotPlan } from "./lumenx-pilot-adapter.mjs";
import { buildXiaohongshuDraftPackagePlan } from "./xiaohongshu-draft-package.mjs";
import { verifyMigrationChainInMemory } from "../db/isolated-migration-verifier.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const configuredPort = Number.parseInt(process.env.ZHIHUI_BRIDGE_PORT ?? "3765", 10);
const port = Number.isInteger(configuredPort) && configuredPort >= 1024 && configuredPort <= 65535 ? configuredPort : 3765;
const engines = JSON.parse(await readFile(join(here, "engines.json"), "utf8"));
const running = new Map();

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "https://zhihui-ai-studio.songfy0118.chatgpt.site", "Access-Control-Allow-Headers": "Content-Type" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") { response.writeHead(204, { "Access-Control-Allow-Origin": "https://zhihui-ai-studio.songfy0118.chatgpt.site", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); return response.end(); }
  if (request.method === "GET" && request.url === "/health") return json(response, 200, { ok: true, gpu: "RTX 4060 Laptop 8GB", engines: Object.keys(engines).length, protocolVersion: BRIDGE_PROTOCOL_VERSION, capabilities: BRIDGE_CAPABILITIES });
  if (request.method === "GET" && request.url === "/engines") return json(response, 200, { engines: Object.entries(engines).map(([id, item]) => ({ id, ...item, running: running.has(id) })) });
  if (request.method === "GET" && request.url === "/local-engines/readiness") {
    const [result, cosyVoicePreflight, museTalkPreflight, moneyPrinterPreflight] = await Promise.all([inspectLocalEngines(root), inspectCosyVoiceInstallPreflight(root), inspectMuseTalkInstallPreflight(root), inspectMoneyPrinterPreflight(root)]);
    const cosyVoice = result.engines.find((engine) => engine.id === "cosyvoice");
    if (cosyVoice) cosyVoice.installPreflight = cosyVoicePreflight;
    const museTalk = result.engines.find((engine) => engine.id === "musetalk");
    if (museTalk) museTalk.lipSyncPreflight = museTalkPreflight;
    const moneyPrinter = result.engines.find((engine) => engine.id === "moneyprinter");
    if (moneyPrinter) moneyPrinter.contentPreflight = moneyPrinterPreflight;
    return json(response, 200, result);
  }
  const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && requestUrl.pathname === "/d1/migration-chain/isolated") {
    try {
      const journal = JSON.parse(await readFile(join(root, "drizzle", "meta", "_journal.json"), "utf8"));
      const migrations = await Promise.all((journal.entries ?? []).map(async ({ tag }) => ({ tag, sql: await readFile(join(root, "drizzle", `${tag}.sql`), "utf8") })));
      const result = await verifyMigrationChainInMemory({ journalEntries: journal.entries ?? [], migrations });
      return json(response, result.verified ? 200 : 409, result);
    } catch {
      return json(response, 503, { status: "unavailable", verified: false, blockers: ["isolated_verification_failed"], ephemeralDatabaseWrites: false, liveDatabaseWrites: false, liveApplyPerformed: false, externalCalls: false, costIncurred: false, publishTriggered: false, businessResult: false });
    }
  }
  if (request.method === "GET" && requestUrl.pathname === "/readiness") {
    const project = requestUrl.searchParams.get("project") ?? "octopus-pilot";
    if (!/^[a-z0-9-]+$/.test(project)) return json(response, 400, { error: "Invalid project id" });
    try {
      const readiness = await inspectPackageReadiness(join(root, "work", "packages", project, "manifest.json"));
      const [engineOutputs, engineReadiness] = await Promise.all([
        inspectLocalMiniDramaOutputs("http://127.0.0.1:5679/api/v1", readiness.projectId),
        inspectLocalEngines(root),
      ]);
      const lumenxPlan = buildLumenXPilotPlan({ candidate: getLocalMiniDramaPilotInput(engineOutputs) });
      return json(response, 200, { ...readiness, engineOutputs, lumenxAdapterPlan: summarizeLumenXPilotPlan(lumenxPlan), generationPlan: buildGenerationPlan(engineOutputs, readiness, engineReadiness.engines) });
    } catch {
      return json(response, 503, { error: "Local delivery manifest is unavailable" });
    }
  }
  if (request.method === "GET" && requestUrl.pathname === "/social-draft-package") {
    const project = requestUrl.searchParams.get("project") ?? "octopus-pilot";
    if (!/^[a-z0-9-]+$/.test(project)) return json(response, 400, { error: "Invalid project id" });
    try {
      const packageRoot = join(root, "work", "packages", project);
      const manifestPath = join(packageRoot, "manifest.json");
      const [manifestText, platformCopyText, readiness] = await Promise.all([
        readFile(manifestPath, "utf8"),
        readFile(join(packageRoot, "xiaohongshu.json"), "utf8"),
        inspectPackageReadiness(manifestPath),
      ]);
      const packagePlan = buildXiaohongshuDraftPackagePlan({ project, readiness, platformCopy:JSON.parse(platformCopyText), manifestText, platformCopyText });
      return json(response, 200, { status: "preview_only", packagePlan, externalCalls: false, uploadTriggered: false, draftSaveTriggered: false, publishTriggered: false });
    } catch {
      return json(response, 404, { error: "Local delivery package is unavailable", packagePlan: null, externalCalls: false, uploadTriggered: false, draftSaveTriggered: false, publishTriggered: false });
    }
  }
  if (request.method === "POST" && requestUrl.pathname === "/readiness/sync") {
    const project = requestUrl.searchParams.get("project") ?? "octopus-pilot";
    if (!/^[a-z0-9-]+$/.test(project)) return json(response, 400, { error: "Invalid project id" });
    try {
      const manifestPath = join(root, "work", "packages", project, "manifest.json");
      const before = await inspectPackageReadiness(manifestPath);
      const engineOutputs = await inspectLocalMiniDramaOutputs("http://127.0.0.1:5679/api/v1", before.projectId);
      const sync = await registerLocalMiniDramaArtifacts({
        manifestPath,
        engineOutputs,
        storageRoots: [join(root, "vendor", "LocalMiniDrama", "backend-node", "data", "storage")],
      });
      const [readiness, engineReadiness] = await Promise.all([inspectPackageReadiness(manifestPath), inspectLocalEngines(root)]);
      const lumenxPlan = buildLumenXPilotPlan({ candidate: getLocalMiniDramaPilotInput(engineOutputs) });
      return json(response, 200, { ...readiness, engineOutputs, lumenxAdapterPlan: summarizeLumenXPilotPlan(lumenxPlan), generationPlan: buildGenerationPlan(engineOutputs, readiness, engineReadiness.engines), sync });
    } catch (error) {
      return json(response, 503, { error: error instanceof Error ? error.message : "Local artifact sync failed" });
    }
  }
  const match = request.url?.match(/^\/engines\/([a-z]+)\/start$/);
  if (request.method === "POST" && match) {
    const id = match[1]; const item = engines[id];
    if (!item) return json(response, 404, { error: "Unknown engine" });
    if (!item.enabled) return json(response, 409, { error: item.reason });
    if (running.has(id)) return json(response, 200, { ok: true, url: item.url, alreadyRunning: true });
    const child = spawn("cmd.exe", ["/c", item.command], { cwd: resolve(root, item.cwd), windowsHide: true, detached: false });
    running.set(id, child.pid); child.on("exit", () => running.delete(id));
    return json(response, 202, { ok: true, url: item.url, pid: child.pid });
  }
  return json(response, 404, { error: "Not found" });
});

server.listen(port, "127.0.0.1", () => console.log(`Zhihui local bridge: http://127.0.0.1:${port}`));
