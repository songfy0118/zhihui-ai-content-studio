import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/local/chinese-rewrite/route.ts";

test("blocks remote callers before local model execution", async () => {
  const response = await POST(new Request("https://studio.example/api/local/chinese-rewrite", {
    method:"POST",
    body:JSON.stringify({}),
  }));
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /只能从本机/);
});

test("returns a diagnostic contract failure for an invalid local plan", async () => {
  const response = await POST(new Request("http://127.0.0.1:3002/api/local/chinese-rewrite", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ status:"not_ready" }),
  }));
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.deepEqual(body.blockers, ["chinese_internet_rewrite_plan_invalid_or_tampered"]);
  assert.equal(body.modelCalls, 0);
  assert.equal(body.draftSaved, false);
  assert.equal(body.publishTriggered, false);
});

test("rejects malformed local JSON", async () => {
  const response = await POST(new Request("http://localhost:3002/api/local/chinese-rewrite", {
    method:"POST",
    body:"not json",
  }));
  assert.equal(response.status, 400);
});
