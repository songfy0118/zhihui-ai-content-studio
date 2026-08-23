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

test("wires a preview-only route and console form without URL fetching or storage", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/manual-evidence-preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /人工公开来源预览（不保存）/);
  assert.match(page, /fetch\("\/api\/news\/manual-evidence-preview"/);
  assert.match(route, /buildManualPublicEvidencePreview/);
  assert.match(route, /externalCalls: 0/);
  assert.doesNotMatch(route, /fetch\(.*canonicalUrl|axios|got\(|getDb|\.insert\(|\.update\(|\.delete\(/s);
});
