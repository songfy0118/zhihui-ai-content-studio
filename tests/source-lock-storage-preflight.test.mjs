import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { inspectSourceLockStorage } from "../db/source-lock-storage-inspector.mjs";
import { assessSourceLockMigrationPreflight } from "../bridge/source-lock-migration-preflight.mjs";

const lockColumns = ["id", "lead_id", "title", "review_fingerprint", "save_plan_fingerprint", "status", "created_at", "updated_at"];
const evidenceColumns = ["source_lock_id", "evidence_id", "source_id", "source_name", "title", "canonical_url", "published_at", "evidence_role", "created_at"];
const schemaObjects = [
  ["source_locks", "table"], ["source_lock_evidence", "table"],
  ["uq_source_locks_review_fingerprint", "index"], ["uq_source_locks_save_plan_fingerprint", "index"], ["idx_source_locks_lead_created_at", "index"],
  ["uq_source_lock_evidence_lock_role", "index"], ["idx_source_lock_evidence_canonical_url", "index"], ["idx_source_lock_evidence_source_id", "index"],
];

function fakeD1({ present = true } = {}) {
  return {
    prepare(sql) {
      return {
        async all() {
          if (!present) return { results: [] };
          if (sql.includes("sqlite_schema")) return { results: schemaObjects.map(([name,type]) => ({ name, type })) };
          if (sql.includes("source_lock_evidence")) return { results: evidenceColumns.map((name) => ({ name })) };
          return { results: lockColumns.map((name) => ({ name })) };
        },
      };
    },
  };
}

test("inspects verified and missing source-lock storage without writes", async () => {
  const verified = await inspectSourceLockStorage(fakeD1());
  assert.equal(verified.status, "verified");
  assert.equal(verified.missingObjects.length, 0);
  assert.equal(verified.missingColumns.length, 0);
  assert.equal(verified.databaseWrites, false);
  assert.equal(verified.applyPerformed, false);
  const missing = await inspectSourceLockStorage(fakeD1({ present:false }));
  assert.equal(missing.status, "missing");
});

test("accepts only the generated create-only migration as a local plan", async () => {
  const [migrationSql, hostingRaw] = await Promise.all([
    readFile(new URL("../drizzle/0007_silly_turbo.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  const plan = assessSourceLockMigrationPreflight({ hosting: JSON.parse(hostingRaw), migrationTag: "0007_silly_turbo", migrationSql, storageStatus: "missing" });
  assert.equal(plan.readyToApplyLocally, true);
  assert.equal(plan.onlyCreateStatements, true);
  assert.equal(plan.destructiveStatements, false);
  assert.equal(plan.applyImplemented, false);
  assert.equal(plan.applyPerformed, false);
  assert.equal(plan.databaseWrites, false);
});

test("blocks partial or already-present storage", async () => {
  const migrationSql = await readFile(new URL("../drizzle/0007_silly_turbo.sql", import.meta.url), "utf8");
  assert.ok(assessSourceLockMigrationPreflight({ hosting:{d1:"DB"}, migrationTag:"0007_silly_turbo", migrationSql, storageStatus:"partial" }).blockers.includes("storage_status_not_safe_to_apply"));
  assert.ok(assessSourceLockMigrationPreflight({ hosting:{d1:"DB"}, migrationTag:"0007_silly_turbo", migrationSql, storageStatus:"verified" }).blockers.includes("migration_already_applied"));
});

test("checks in schema, migration-chain artifacts and a GET-only local route", async () => {
  const [schema, chain, route, page] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/migration-chain-inspector.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/source-lock-migration/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /sqliteTable\("source_locks"/);
  assert.match(schema, /sqliteTable\("source_lock_evidence"/);
  assert.match(chain, /0007_silly_turbo/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST|getDb|\.insert\(|\.update\(|\.delete\(/);
  assert.match(page, /fetch\("\/api\/local\/source-lock-migration", \{ cache:"no-store" \}\)/);
  assert.match(page, /检查来源锁表（只读）/);
  assert.match(page, /<SourceLockStorageReadinessCard readiness=\{sourceLockStorageReadiness\}/);
  assert.match(page, /function SourceLockSaveBoundarySummary/);
  assert.match(page, /保存计划指纹/);
  assert.match(page, /单次授权预览/);
  assert.match(page, /来源锁表结构/);
  assert.match(page, /写入适配器/);
  assert.match(page, /真实保存路由/);
  assert.match(page, /preview\?\.liveSaveRouteConnected===true/);
  assert.match(page, /只读汇总 · 授权请求 0 · 授权票据 0 · 保存调用 0 · 数据库写入 0 · 草稿解锁 0/);
  assert.match(page, /<SourceLockSaveBoundarySummary plan=\{sourceLockSavePlan\} preview=\{sourceLockSaveAuthorizationPreview\} readiness=\{sourceLockStorageReadiness\}\/\>/);
});
