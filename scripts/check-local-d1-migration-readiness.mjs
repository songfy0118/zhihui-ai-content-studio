import { readFile } from "node:fs/promises";
import { assessLocalD1MigrationPreflight } from "../bridge/local-d1-migration-preflight.mjs";

const root = new URL("../", import.meta.url);
const endpoint = process.env.ZHIHUI_STUDIO_URL ?? "http://127.0.0.1:3000";
const [hostingRaw, journalRaw] = await Promise.all([
  readFile(new URL(".openai/hosting.json", root), "utf8"),
  readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
]);
const hosting = JSON.parse(hostingRaw);
const journal = JSON.parse(journalRaw);
const migrationTag = journal.entries?.at(-1)?.tag ?? null;
if (!migrationTag) throw new Error("migration_tag_missing");
const migrationSql = await readFile(new URL(`drizzle/${migrationTag}.sql`, root), "utf8");
const response = await fetch(`${endpoint}/api/local/pilot-execution`, { signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new Error(`local_storage_check_failed:${response.status}`);
const status = await response.json();
const result = assessLocalD1MigrationPreflight({ hosting, migrationTag, migrationSql, storageStatus: status?.storage?.status });
console.log(JSON.stringify(result, null, 2));
if (!result.readyToApplyLocally) process.exitCode = 2;
