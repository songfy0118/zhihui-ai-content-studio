import { readFile } from "node:fs/promises";
import { buildD1ChainExecutionManifest } from "../bridge/d1-chain-execution-manifest.mjs";
import { buildD1ChainPlan } from "../bridge/d1-chain-plan.mjs";
import { verifyMigrationChainInMemory } from "../db/isolated-migration-verifier.mjs";

const root = new URL("../", import.meta.url);
const journal = JSON.parse(await readFile(new URL("drizzle/meta/_journal.json", root), "utf8"));
const migrations = await Promise.all((journal.entries ?? []).map(async ({ tag }) => ({ tag, sql: await readFile(new URL(`drizzle/${tag}.sql`, root), "utf8") })));
let liveStatus = null;
try {
  const response = await fetch("http://127.0.0.1:3000/api/local/migration-chain", { signal: AbortSignal.timeout(5000) });
  if (response.ok) liveStatus = await response.json();
} catch {}

const plan = buildD1ChainPlan({ journalEntries: journal.entries ?? [], migrations, liveStatus });
const isolatedVerification = await verifyMigrationChainInMemory({ journalEntries: journal.entries ?? [], migrations });
const manifest = buildD1ChainExecutionManifest({ plan, isolatedVerification, migrations });
console.log(JSON.stringify(manifest, null, 2));
if (!manifest.readyForAuthorization) process.exitCode = 1;
