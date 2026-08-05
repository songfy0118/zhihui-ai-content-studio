import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const engines = JSON.parse(await readFile(join(here, "engines.json"), "utf8"));
const running = new Map();

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "https://zhihui-ai-studio.songfy0118.chatgpt.site", "Access-Control-Allow-Headers": "Content-Type" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") { response.writeHead(204, { "Access-Control-Allow-Origin": "https://zhihui-ai-studio.songfy0118.chatgpt.site", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); return response.end(); }
  if (request.method === "GET" && request.url === "/health") return json(response, 200, { ok: true, gpu: "RTX 4060 Laptop 8GB", engines: Object.keys(engines).length });
  if (request.method === "GET" && request.url === "/engines") return json(response, 200, { engines: Object.entries(engines).map(([id, item]) => ({ id, ...item, running: running.has(id) })) });
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

server.listen(3765, "127.0.0.1", () => console.log("Zhihui local bridge: http://127.0.0.1:3765"));
