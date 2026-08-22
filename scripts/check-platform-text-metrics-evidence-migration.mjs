import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG,
  assessPlatformTextMetricsEvidenceMigrationPreflight,
} from "../bridge/platform-text-metrics-evidence-migration-preflight.mjs";

const root = new URL("../", import.meta.url);
const [hostingRaw, journalRaw, migrationSql] = await Promise.all([
  readFile(new URL(".openai/hosting.json", root), "utf8"),
  readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
  readFile(new URL(`drizzle/${PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG}.sql`, root), "utf8"),
]);
const journal = JSON.parse(journalRaw);
const entry = journal.entries?.find(({ tag }) => tag === PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG);
assert.ok(entry, "Platform text metrics evidence migration must be registered in the generated journal");
const plan = assessPlatformTextMetricsEvidenceMigrationPreflight({
  hosting: JSON.parse(hostingRaw),
  migrationTag: entry.tag,
  migrationSql,
  storageStatus: "legacy_verified",
});
assert.equal(plan.readyToApplyLocally, true, `Platform text metrics evidence migration plan blocked: ${plan.blockers.join(", ")}`);
console.log(JSON.stringify({ ...plan, readyToApply: false, liveStateRequired: true }, null, 2));
