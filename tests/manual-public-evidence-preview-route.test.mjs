import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { POST } from "../app/api/news/manual-evidence-preview/route.ts";

test("rejects malformed manual evidence before any external call", async () => {
  const response = await POST(new Request("http://localhost/api/news/manual-evidence-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedIds: [], inputs: [] }),
  }));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.deepEqual(body.blockers, ["invalid_manual_evidence_request"]);
  assert.equal(body.externalCalls, 0);
  assert.equal(body.candidateUrlFetched, false);
  assert.equal(body.manualInputPersisted, false);
  assert.equal(body.databaseWrites, false);
  assert.equal(body.publishTriggered, false);
});

test("wires preview-only routes and manual review/save-plan actions without URL fetching or storage", async () => {
  const [page, route, reviewRoute, savePlanRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/manual-evidence-preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/evidence-review-preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /人工公开来源预览（不保存）/);
  assert.match(page, /修改任一字段会清除旧预览/);
  assert.match(page, /const evidencePipelineRevision = useRef\(0\)/);
  assert.match(page, /const updateManualEvidenceDraft = \(field:keyof ManualEvidenceDraft, value:string\) => \{\s*setManualEvidenceDraft[\s\S]*?setManualEvidencePreview\(null\);[\s\S]*?setEvidenceReviewDecisions\(\{\}\);[\s\S]*?setEvidenceReviewPreview\(null\);[\s\S]*?clearSourceLockSavePreviews\(\);\s*\};/);
  assert.equal(page.match(/updateManualEvidenceDraft\("(?:leadId|sourceName|title|canonicalUrl|publishedAt)",event\.target\.value\)/g)?.length, 5);
  assert.match(page, /const requestRevision = evidencePipelineRevision\.current;[\s\S]*?const preview = await response\.json\(\) as ManualEvidencePreview;[\s\S]*?if \(requestRevision !== evidencePipelineRevision\.current\) return;\s*setManualEvidencePreview\(preview\);/);
  assert.match(page, /fetch\("\/api\/news\/manual-evidence-preview"/);
  assert.match(route, /buildManualPublicEvidencePreview/);
  assert.match(route, /externalCalls: 0/);
  assert.match(page, /进入六项审查预览/);
  assert.match(reviewRoute, /buildManualPublicEvidencePreview/);
  assert.match(savePlanRoute, /buildManualPublicEvidencePreview/);
  assert.match(savePlanRoute, /manualInputs/);
  assert.match(savePlanRoute, /candidateUrlFetched: false/);
  assert.match(savePlanRoute, /manualInputPersisted: false/);
  assert.doesNotMatch(reviewRoute, /manual_evidence_save_path_not_connected/);
  assert.doesNotMatch(route, /fetch\(.*canonicalUrl|axios|got\(|getDb|\.insert\(|\.update\(|\.delete\(/s);
  assert.doesNotMatch(reviewRoute, /fetch\(.*canonicalUrl|axios|got\(|getDb|\.insert\(|\.update\(|\.delete\(/s);
  assert.doesNotMatch(savePlanRoute, /fetch\(.*canonicalUrl|axios|got\(|getDb|\.insert\(|\.update\(|\.delete\(/s);
});
