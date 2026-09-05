import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the accepted-claim rewrite route local, bounded and review-only", async () => {
  const route = await readFile(new URL("../app/api/local/accepted-claim-rewrite/route.ts", import.meta.url), "utf8");
  assert.match(route, /hostname === "127\.0\.0\.1" \|\| hostname === "localhost"/);
  assert.match(route, /const MAX_REQUEST_BYTES = 2_000/);
  assert.match(route, /createHumanClaimAcceptanceReader/);
  assert.match(route, /buildAcceptedClaimDraftBlueprint/);
  assert.match(route, /executeChineseInternetRewrite/);
  assert.match(route, /humanReviewRequired:true/);
  assert.match(route, /databaseWrites:false/);
  assert.match(route, /draftSaved:false/);
  assert.match(route, /publishTriggered:false/);
  assert.doesNotMatch(route, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i);
});
