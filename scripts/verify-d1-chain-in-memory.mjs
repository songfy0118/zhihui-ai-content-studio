import { readFile } from "node:fs/promises";
import { verifyMigrationChainInMemory } from "../db/isolated-migration-verifier.mjs";

const root = new URL("../", import.meta.url);
const journal = JSON.parse(await readFile(new URL("drizzle/meta/_journal.json", root), "utf8"));
const migrations = await Promise.all((journal.entries ?? []).map(async ({ tag }) => ({ tag, sql: await readFile(new URL(`drizzle/${tag}.sql`, root), "utf8") })));
const result = await verifyMigrationChainInMemory({ journalEntries: journal.entries ?? [], migrations });
console.log(JSON.stringify(result, null, 2));
if (!result.verified) process.exitCode = 1;
