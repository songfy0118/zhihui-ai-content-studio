import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG,
  assessAccountTopicWeightStoreMigrationPreflight,
} from "../bridge/account-topic-weight-store-migration-preflight.mjs";

const root = new URL("../", import.meta.url);
const [hostingRaw, journalRaw, migrationSql] = await Promise.all([
  readFile(new URL(".openai/hosting.json", root), "utf8"),
  readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
  readFile(new URL(`drizzle/${ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG}.sql`, root), "utf8"),
]);
const journal = JSON.parse(journalRaw);
const entry = journal.entries?.find(({ tag }) => tag === ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG);
assert.ok(entry, "Account topic weight store migration must be registered in the generated journal");
const plan = assessAccountTopicWeightStoreMigrationPreflight({
  hosting: JSON.parse(hostingRaw),
  migrationTag: entry.tag,
  migrationSql,
  storageStatus: "missing",
});
assert.equal(plan.readyToApplyLocally, true, `Account topic weight store migration plan blocked: ${plan.blockers.join(", ")}`);
console.log(JSON.stringify({ ...plan, readyToApply: false, liveStateRequired: true }, null, 2));
