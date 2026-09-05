import { readFile } from "node:fs/promises";
import { assessD1ChainApplyRequest } from "../bridge/d1-chain-apply-guard.mjs";
import { buildD1ChainPlan } from "../bridge/d1-chain-plan.mjs";

const root = new URL("../", import.meta.url);
const studioUrl = process.env.ZHIHUI_STUDIO_URL ?? "http://127.0.0.1:3000";
const args = new Set(process.argv.slice(2));
const executeRequested = args.has("--execute");
const confirmationArg = [...args].find((arg) => arg.startsWith("--confirmation="));
const confirmation = confirmationArg?.slice("--confirmation=".length) ?? "";
const journal = JSON.parse(await readFile(new URL("drizzle/meta/_journal.json", root), "utf8"));
const migrations = await Promise.all((journal.entries ?? []).map(async ({ tag }) => ({
  tag,
  sql: await readFile(new URL(`drizzle/${tag}.sql`, root), "utf8"),
})));

let liveStatus = null;
try {
  const response = await fetch(`${studioUrl}/api/local/migration-chain`, { signal: AbortSignal.timeout(5000) });
  if (response.ok) liveStatus = await response.json();
} catch {
  liveStatus = null;
}

const plan = buildD1ChainPlan({ journalEntries: journal.entries ?? [], migrations, liveStatus });
const guard = assessD1ChainApplyRequest({ plan, executeRequested, confirmation });
console.log(JSON.stringify({ plan, guard }, null, 2));

if (!plan.sourcePlanReady || executeRequested) process.exitCode = 1;
