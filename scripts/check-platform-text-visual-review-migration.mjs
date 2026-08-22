import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { assessPlatformTextVisualReviewMigrationPreflight } from "../bridge/platform-text-visual-review-migration-preflight.mjs";

const root = new URL("../", import.meta.url);
const [hostingRaw, journalRaw, migrationSql] = await Promise.all([
  readFile(new URL(".openai/hosting.json", root), "utf8"),
  readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
  readFile(new URL("drizzle/0010_tranquil_donald_blake.sql", root), "utf8"),
]);
const journal = JSON.parse(journalRaw);
const entry = journal.entries?.find(({ tag }) => tag === "0010_tranquil_donald_blake");
assert.ok(entry, "Platform text visual review migration must be registered in the generated journal");
const plan = assessPlatformTextVisualReviewMigrationPreflight({
  hosting: JSON.parse(hostingRaw),
  migrationTag: entry.tag,
  migrationSql,
  storageStatus: "missing",
});
assert.equal(plan.readyToApplyLocally, true, `Platform text visual review migration plan blocked: ${plan.blockers.join(", ")}`);
console.log(JSON.stringify({ ...plan, readyToApply: false, liveStateRequired: true }, null, 2));
