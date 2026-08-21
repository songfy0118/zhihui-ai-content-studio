import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessSourceLockMigrationPreflight } from "../bridge/source-lock-migration-preflight.mjs";

const root = new URL("../", import.meta.url);
const [hostingRaw, journalRaw, migrationSql] = await Promise.all([
  readFile(new URL(".openai/hosting.json", root), "utf8"),
  readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
  readFile(new URL("drizzle/0007_silly_turbo.sql", root), "utf8"),
]);
const hosting = JSON.parse(hostingRaw);
const journal = JSON.parse(journalRaw);
const latest = journal.entries?.at(-1);
assert.equal(latest?.tag, "0007_silly_turbo", "Source lock migration must remain the latest generated migration");
const plan = assessSourceLockMigrationPreflight({ hosting, migrationTag: latest.tag, migrationSql, storageStatus: "missing" });
assert.equal(plan.readyToApplyLocally, true, `Source lock migration plan blocked: ${plan.blockers.join(", ")}`);
console.log(JSON.stringify({ ...plan, readyToApply: false, liveStateRequired: true }, null, 2));
