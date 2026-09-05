import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scripts = [
  "plan-local-d1-chain.mjs",
  "prepare-local-d1-execution.mjs",
  "apply-local-d1-chain.mjs",
];

test("all local D1 chain scripts honor the configured studio URL", async () => {
  for (const script of scripts) {
    const source = await readFile(new URL(`../scripts/${script}`, import.meta.url), "utf8");
    assert.match(source, /process\.env\.ZHIHUI_STUDIO_URL/);
    assert.match(source, /fetch\(`\$\{studioUrl\}\/api\/local\/migration-chain`/);
    assert.doesNotMatch(source, /fetch\("http:\/\/127\.0\.0\.1:3000\/api\/local\/migration-chain"/);
  }
});
