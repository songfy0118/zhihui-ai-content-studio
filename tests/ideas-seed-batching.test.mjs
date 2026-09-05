import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/ideas/route.ts", import.meta.url);

test("seeds the topic catalog in D1-safe idempotent batches", async () => {
  const source = await readFile(routePath, "utf8");

  assert.match(source, /const D1_INSERT_BATCH_SIZE = 10/);
  assert.match(source, /offset \+= D1_INSERT_BATCH_SIZE/);
  assert.match(source, /rows\.slice\(offset, offset \+ D1_INSERT_BATCH_SIZE\)/);
  assert.match(source, /onConflictDoNothing\(\{ target: ideas\.id \}\)/);
});
