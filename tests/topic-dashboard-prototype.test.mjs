import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("paginates the topic prototype and labels uncalibrated view ranges", async () => {
  const [page, route, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ideas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const TOPICS_PER_PAGE = 10/);
  assert.match(page, /visibleIdeas\.map/);
  assert.match(page, /下一页 →/);
  assert.match(page, /抖音模拟播放区间/);
  assert.match(page, /待真实账号数据校准/);
  assert.match(page, /DOUYIN DRAFT · LOCAL PROTOTYPE/);
  assert.match(page, /未写入抖音 · 未发布/);
  assert.match(route, /onConflictDoNothing/);
  assert.match(route, /chip-supply-chain/);
  assert.match(styles, /\.topicPager/);
  assert.match(styles, /\.localDraftPreview/);
});
