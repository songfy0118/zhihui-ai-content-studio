import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { REQUIRED_REVIEW_CHECKS, validateReviewApproval, validateReviewableStatus } from "../bridge/review-gate.mjs";
import { classifyArtifactForProduction, validateProductionReadiness } from "../bridge/production-readiness.mjs";
import { inspectPackageReadiness, sha256 } from "../bridge/package-readiness.mjs";
import { getLocalMiniDramaPilotInput, inspectLocalMiniDramaOutputs } from "../bridge/local-mini-drama-artifacts.mjs";
import { registerLocalMiniDramaArtifacts } from "../bridge/register-local-artifacts.mjs";
import { diagnoseModelConfigs } from "../bridge/model-diagnostics.mjs";
import { inspectLocalEngines } from "../bridge/local-engine-readiness.mjs";
import { assessCosyVoiceInstallPreflight } from "../bridge/cosyvoice-install-preflight.mjs";
import { assessMuseTalkInstallPreflight } from "../bridge/musetalk-install-preflight.mjs";
import { assessMoneyPrinterPreflight } from "../bridge/moneyprinter-preflight.mjs";
import { BRIDGE_CAPABILITIES, BRIDGE_PROTOCOL_VERSION, assessBridgeProtocol } from "../bridge/protocol.mjs";
import { inspectLocalRuntime, LOCAL_RUNTIME_SERVICES } from "../bridge/local-runtime-doctor.mjs";
import { buildGenerationPlan } from "../bridge/generation-plan.mjs";
import { assessLumenXConfiguration, inspectLumenXConfiguration } from "../bridge/lumenx-configuration.mjs";
import { classifySensitivePath, findSecretAssignments } from "../bridge/secret-boundary.mjs";
import { planPilotExecution, validatePilotExecutionApproval } from "../bridge/pilot-execution-gate.mjs";
import { createPilotAuthorizationReceiptStore } from "../bridge/pilot-authorization-receipts.mjs";
import { CONSUME_RECEIPT_SQL, CREATE_RECEIPT_EXECUTION_INDEX_SQL, CREATE_RECEIPT_EXPIRY_INDEX_SQL, CREATE_RECEIPT_TABLE_SQL, EXPIRE_RECEIPT_SQL, INSERT_RECEIPT_SQL, INSPECT_RECEIPT_INDEXES_SQL, INSPECT_RECEIPT_SQL, INSPECT_RECEIPT_TABLE_SQL, applyPilotAuthorizationReceiptStorage, createPersistentPilotAuthorizationReceiptStore, inspectPilotAuthorizationReceiptStorage } from "../db/pilot-authorization-receipt-store.mjs";
import { validateFactReview } from "../bridge/fact-review-policy.mjs";
import { buildSourceLockedScriptEnvelope } from "../bridge/source-locked-script-envelope.mjs";
import { discoverLocalMiniDramaScriptArtifacts } from "../bridge/local-mini-drama-script-artifacts.mjs";
import { assessScriptOutput } from "../bridge/script-output-acceptance.mjs";
import { buildScriptReviewDraft, REQUIRED_SCRIPT_REVIEW_CHECKS } from "../bridge/script-review-draft.mjs";
import { validateScriptReviewPreview } from "../bridge/script-review-preview.mjs";
import { assessPreproductionGate } from "../bridge/preproduction-gate.mjs";
import { buildScriptReviewAcceptance } from "../bridge/script-review-acceptance.mjs";
import { buildSourceLockedScriptPlan, summarizeSourceLockedScriptPlan } from "../bridge/source-locked-script-plan.mjs";
import { validateScriptExecutionApproval } from "../bridge/script-execution-gate.mjs";
import { checkSourceAvailability } from "../bridge/source-availability.mjs";
import { filterVerifiedMetrics, validateMetricProvenance } from "../bridge/metrics-provenance.mjs";
import { inspectMetricsProvenanceStorage, REQUIRED_METRICS_PROVENANCE_COLUMNS, REQUIRED_METRICS_PROVENANCE_INDEX } from "../db/metrics-provenance-store.mjs";
import { inspectMigrationChain, MIGRATION_CHAIN } from "../db/migration-chain-inspector.mjs";
import { verifyMigrationChainInMemory } from "../db/isolated-migration-verifier.mjs";
import { buildD1ChainPlan } from "../bridge/d1-chain-plan.mjs";
import { buildD1ChainExecutionManifest } from "../bridge/d1-chain-execution-manifest.mjs";
import { assessD1ChainApplyRequest, FULL_CHAIN_CONFIRMATION } from "../bridge/d1-chain-apply-guard.mjs";
import { validatePlatformPackages } from "../bridge/platform-package-policy.mjs";
import { buildLumenXPilotPlan, summarizeLumenXPilotPlan } from "../bridge/lumenx-pilot-adapter.mjs";
import { buildSocialDraftHandoffPlan } from "../bridge/social-draft-handoff.mjs";
import { inspectSocialDraftAssets } from "../bridge/social-draft-assets.mjs";
import { buildXiaohongshuDraftPackagePlan } from "../bridge/xiaohongshu-draft-package.mjs";
import { planXiaohongshuDraftExecution } from "../bridge/xiaohongshu-draft-execution.mjs";
import { assessLocalD1MigrationPreflight } from "../bridge/local-d1-migration-preflight.mjs";

const projectRoot = new URL("../", import.meta.url);
const validPlatformCopies = {
  douyin: { title: "章鱼面试", caption: "三个心脏，但不是九个独立大脑。", cover_text: "九个大脑？", hashtags: ["章鱼", "科普"], language: "zh-CN", source_note: "来源：Smithsonian、PMC" },
  tiktok: { title: "The octopus interview", caption: "Three hearts, but not nine separate brains.", cover_text: "NINE BRAINS?", hashtags: ["Octopus", "ScienceTok"], language: "en-US", source_note: "Sources: Smithsonian and PMC" },
  xiaohongshu: { title: "章鱼面试笔记", caption: "用面试故事理解章鱼的分布式神经系统。", cover_text: "章鱼神经系统", hashtags: ["动物科普", "冷知识"], language: "zh-CN", source_note: "来源：Smithsonian、PMC" },
};

test("keeps character and storyboard planning locked until a matching review is durably accepted", async () => {
  const sourceLockFingerprint = "a".repeat(64);
  const outputFingerprint = "b".repeat(64);
  const artifact = {
    scriptOutputPresent: true,
    outputFingerprint,
    sourceLockFingerprint: null,
    sourceLockProvenancePresent: false,
  };
  const blocked = assessPreproductionGate({ artifact, sourceLockFingerprint, reviewRecord: null });
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.blockers, ["source_lock_provenance_missing", "review_record_missing"]);
  assert.equal(blocked.executionAllowed, false);
  assert.equal(blocked.localMiniDramaCalls, 0);
  assert.equal(blocked.lumenXCalls, 0);
  assert.equal(blocked.databaseWrites, false);

  const accepted = assessPreproductionGate({
    artifact: { ...artifact, sourceLockFingerprint, sourceLockProvenancePresent: true },
    sourceLockFingerprint,
    reviewRecord: {
      persisted: true,
      status: "accepted",
      outputFingerprint,
      sourceLockFingerprint,
      checks: Object.fromEntries(REQUIRED_SCRIPT_REVIEW_CHECKS.map((id) => [id, true])),
    },
  });
  assert.equal(accepted.ready, true);
  assert.equal(accepted.planningAllowed, true);
  assert.equal(accepted.executionAllowed, false);
  assert.equal(accepted.characterGenerationTriggered, false);
  assert.equal(accepted.storyboardGenerationTriggered, false);
  assert.equal(accepted.modelCalls, 0);

  const [route, page, styles] = await Promise.all([
    readFile(new URL("../app/api/local/preproduction-gate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST|\.insert\(|\.update\(|\.delete\(|\.run\(|\.batch\(/);
  assert.match(route, /findAcceptedScriptReview/);
  assert.match(route, /reviewRecordLookup = "storage_not_initialized"/);
  assert.match(page, /fetch\("\/api\/local\/preproduction-gate"/);
  assert.match(page, /PREPRODUCTION GATE · 只读/);
  assert.match(page, /角色与分镜保持锁定/);
  assert.match(styles, /\.preproductionGate/);
});

test("persists only a current explicitly confirmed script review fingerprint", async () => {
  const sourceLockFingerprint = "a".repeat(64);
  const artifact = {
    outputFingerprint: "b".repeat(64),
    sourceLockFingerprint: null,
    sourceLockProvenancePresent: false,
  };
  const draft = buildScriptReviewDraft({ artifact, sourceLockFingerprint });
  const request = {
    outputFingerprint: draft.outputFingerprint,
    plannedSourceLockFingerprint: draft.plannedSourceLockFingerprint,
    reviewDraftFingerprint: draft.reviewDraftFingerprint,
    checks: Object.fromEntries(REQUIRED_SCRIPT_REVIEW_CHECKS.map((id) => [id, true])),
    confirmCurrentFingerprints: true,
  };
  const preview = validateScriptReviewPreview({ draft, request });
  const blocked = buildScriptReviewAcceptance({
    draft,
    request: { ...request, previewFingerprint: preview.previewFingerprint },
    sourceIdeaId: "octopus",
    dramaId: 1,
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.blockers, ["persisted_acceptance_confirmation_missing"]);

  const accepted = buildScriptReviewAcceptance({
    draft,
    request: { ...request, previewFingerprint: preview.previewFingerprint, confirmPersistedAcceptance: true },
    sourceIdeaId: "octopus",
    dramaId: 1,
    reviewedAt: "2026-08-10T00:00:00.000Z",
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.record.status, "accepted");
  assert.equal(accepted.record.outputFingerprint, artifact.outputFingerprint);
  assert.equal(accepted.record.sourceLockFingerprint, sourceLockFingerprint);
  assert.equal(accepted.confirmedChecks, REQUIRED_SCRIPT_REVIEW_CHECKS.length);
  assert.equal(accepted.databaseWrites, false);
  assert.equal(accepted.downstreamUnlocked, false);
  assert.equal(accepted.modelCalls, 0);

  const tampered = buildScriptReviewAcceptance({
    draft,
    request: { ...request, previewFingerprint: "c".repeat(64), confirmPersistedAcceptance: true },
    sourceIdeaId: "octopus",
    dramaId: 1,
  });
  assert.equal(tampered.ok, false);
  assert.ok(tampered.blockers.includes("preview_fingerprint_mismatch"));

  const [route, store, schema, migration, page] = await Promise.all([
    readFile(new URL("../app/api/local/script-review-acceptance/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/script-review-acceptance-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_jazzy_toad.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /isLocalRequest/);
  assert.match(route, /confirmPersistedAcceptance/);
  assert.match(route, /scriptContentsReturned:\s*false/);
  assert.match(route, /modelCalls:\s*0/);
  assert.match(route, /migrationRequired:\s*"0005_jazzy_toad"/);
  assert.match(store, /onConflictDoNothing/);
  assert.match(schema, /sqliteTable\("script_review_acceptances"/);
  assert.match(migration, /CREATE TABLE `script_review_acceptances`/);
  assert.match(migration, /uq_script_review_acceptances_output_source_lock/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i);
  assert.match(page, /保存人工验收记录/);
  assert.match(page, /不调用模型 · 不生成角色或分镜/);
});

test("accepts source-locked scripts only after explicit human semantic review", () => {
  const envelope = {
    ready: true,
    inputFingerprint: "a".repeat(64),
    claims: [
      { id: "claim-1", sourceRefs: ["source-1"] },
      { id: "claim-2", sourceRefs: ["source-1", "source-2"] },
    ],
  };
  const reviewedOutput = {
    sourceLockFingerprint: envelope.inputFingerprint,
    content: "A reviewed script whose factual meaning was checked by a person.",
    claimUsage: [
      { claimId: "claim-1", included: true, sourceRefs: ["source-1"] },
      { claimId: "claim-2", included: false, sourceRefs: [] },
    ],
    uncitedFactualClaims: [],
    review: {
      status: "reviewed",
      reviewedAt: "2026-08-10",
      checks: {
        facts_match_source_lock: true,
        no_uncited_factual_claims: true,
        uncertainty_preserved: true,
        source_notes_present: true,
        platform_safety_checked: true,
      },
    },
  };

  const accepted = assessScriptOutput({ envelope, output: reviewedOutput });
  assert.equal(accepted.ready, true);
  assert.equal(accepted.status, "ready_for_character_and_storyboard");
  assert.deepEqual(accepted.counts, { knownClaims: 2, accountedClaims: 2, includedClaims: 1, uncitedFactualClaims: 0 });
  assert.equal(accepted.semanticVerification, "human_required");
  assert.equal(accepted.automatedFactVerification, false);
  assert.equal(accepted.modelCalls, 0);
  assert.equal(accepted.externalCalls, false);
  assert.equal(accepted.costIncurred, false);
  assert.equal(accepted.generatedMedia, false);
  assert.equal(accepted.publishTriggered, false);
  assert.equal(accepted.businessResult, false);

  const uncited = assessScriptOutput({
    envelope,
    output: { ...reviewedOutput, uncitedFactualClaims: ["A new fact not in the source lock"] },
  });
  assert.equal(uncited.ready, false);
  assert.ok(uncited.blockers.includes("uncited_factual_claims_present"));

  const mismatched = assessScriptOutput({
    envelope,
    output: {
      ...reviewedOutput,
      sourceLockFingerprint: "b".repeat(64),
      claimUsage: [
        { claimId: "claim-1", included: true, sourceRefs: ["source-2"] },
        { claimId: "claim-unknown", included: false, sourceRefs: [] },
      ],
    },
  });
  assert.equal(mismatched.ready, false);
  assert.ok(mismatched.blockers.includes("source_lock_mismatch"));
  assert.ok(mismatched.blockers.includes("source_reference_mismatch"));
  assert.ok(mismatched.blockers.includes("unknown_claim_reference"));
  assert.ok(mismatched.blockers.includes("claim_usage_incomplete"));

  const unreviewed = assessScriptOutput({
    envelope,
    output: { ...reviewedOutput, review: { status: "draft", reviewedAt: "", checks: {} } },
  });
  assert.equal(unreviewed.ready, false);
  assert.ok(unreviewed.blockers.includes("human_review_required"));
  assert.ok(unreviewed.blockers.includes("review_date_missing"));
  assert.ok(unreviewed.blockers.includes("human_checks_incomplete"));
});

test("discovers real LocalMiniDrama scripts without returning their contents or accepting facts", () => {
  const privateScript = "A real local script body that must not be returned.";
  const discovery = discoverLocalMiniDramaScriptArtifacts({
    data: {
      items: [
        {
          id: 17,
          status: "draft",
          updated_at: "2026-08-10T08:00:00Z",
          metadata: { source: "zhihui-content-os", source_idea_id: "octopus", fact_review: { status: "reviewed" } },
          episodes: [
            { id: 1, script_content: privateScript },
            { id: 2, script_content: "" },
          ],
        },
        { id: 18, metadata: { source: "unrelated" }, episodes: [{ script_content: "ignore" }] },
      ],
    },
  });
  assert.equal(discovery.status, "script_outputs_discovered");
  assert.equal(discovery.scriptOutputPresent, true);
  assert.equal(discovery.projectCount, 1);
  assert.equal(discovery.scriptProjectCount, 1);
  assert.equal(discovery.projects[0].episodeCount, 2);
  assert.equal(discovery.projects[0].scriptEpisodeCount, 1);
  assert.match(discovery.projects[0].outputFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(discovery.projects[0].fingerprintAlgorithm, "sha256");
  assert.equal(discovery.projects[0].fingerprintScope, "episode_id_and_script_content");
  assert.equal(discovery.projects[0].sourceLockProvenancePresent, false);
  assert.equal(discovery.projects[0].metadataFactReviewPresent, true);
  assert.equal(discovery.scriptContentsReturned, false);
  assert.equal(discovery.semanticVerification, "not_run");
  assert.equal(discovery.automatedFactVerification, false);
  assert.equal(discovery.databaseWrites, false);
  assert.equal(discovery.modelCalls, 0);
  assert.equal(discovery.externalCalls, false);
  assert.equal(discovery.businessResult, false);
  assert.doesNotMatch(JSON.stringify(discovery), new RegExp(privateScript));

  const pendingAcceptance = assessScriptOutput({
    envelope: { ready: true, inputFingerprint: "a".repeat(64), claims: [{ id: "claim-1", sourceRefs: ["source-1"] }] },
    output: { scriptContentPresent: true },
  });
  assert.equal(pendingAcceptance.ready, false);
  assert.equal(pendingAcceptance.blockers.includes("script_content_missing"), false);
  assert.ok(pendingAcceptance.blockers.includes("source_lock_mismatch"));
  assert.ok(pendingAcceptance.blockers.includes("human_review_required"));

  const reviewDraft = buildScriptReviewDraft({
    artifact: discovery.projects[0],
    sourceLockFingerprint: "a".repeat(64),
  });
  assert.equal(reviewDraft.status, "draft_blocked");
  assert.equal(reviewDraft.reviewable, true);
  assert.deepEqual(reviewDraft.blockers, ["source_lock_provenance_missing"]);
  assert.match(reviewDraft.reviewDraftFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(reviewDraft.confirmedChecks, 0);
  assert.equal(reviewDraft.totalChecks, REQUIRED_SCRIPT_REVIEW_CHECKS.length);
  assert.ok(reviewDraft.checks.every((check) => check.confirmed === false));
  assert.equal(reviewDraft.persisted, false);
  assert.equal(reviewDraft.databaseWrites, false);
  assert.equal(reviewDraft.semanticVerification, "not_run");
  assert.equal(reviewDraft.scriptContentsReturned, false);
  assert.equal(reviewDraft.businessResult, false);

  const changedDiscovery = discoverLocalMiniDramaScriptArtifacts({
    data: { items: [{ id: 17, metadata: { source: "zhihui-content-os" }, episodes: [{ id: 1, script_content: `${privateScript} changed` }] }] },
  });
  assert.notEqual(changedDiscovery.projects[0].outputFingerprint, discovery.projects[0].outputFingerprint);

  const completeChecks = Object.fromEntries(REQUIRED_SCRIPT_REVIEW_CHECKS.map((id) => [id, true]));
  const completePreview = validateScriptReviewPreview({
    draft: reviewDraft,
    request: {
      outputFingerprint: reviewDraft.outputFingerprint,
      plannedSourceLockFingerprint: reviewDraft.plannedSourceLockFingerprint,
      reviewDraftFingerprint: reviewDraft.reviewDraftFingerprint,
      checks: completeChecks,
      confirmCurrentFingerprints: true,
    },
  });
  assert.equal(completePreview.previewComplete, true);
  assert.equal(completePreview.eligibleForAuthorizedSave, true);
  assert.match(completePreview.previewFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(completePreview.acceptanceBlockers, ["review_not_persisted", "source_lock_provenance_missing"]);
  assert.equal(completePreview.acceptanceRecorded, false);
  assert.equal(completePreview.downstreamUnlocked, false);
  assert.equal(completePreview.persisted, false);
  assert.equal(completePreview.databaseWrites, false);
  assert.equal(completePreview.scriptContentsReturned, false);

  const stalePreview = validateScriptReviewPreview({
    draft: reviewDraft,
    request: { outputFingerprint: "b".repeat(64), checks: completeChecks, confirmCurrentFingerprints: false },
  });
  assert.equal(stalePreview.previewComplete, false);
  assert.ok(stalePreview.blockers.includes("output_fingerprint_mismatch"));
  assert.ok(stalePreview.blockers.includes("source_lock_fingerprint_mismatch"));
  assert.ok(stalePreview.blockers.includes("review_draft_fingerprint_mismatch"));
  assert.ok(stalePreview.blockers.includes("fingerprint_confirmation_missing"));
});

function createFakeReceiptD1() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let values = [];
      return {
        bind(...bound) { values = bound; return this; },
        async run() {
          if (sql === INSERT_RECEIPT_SQL) {
            if (rows.has(values[0])) return { success: false, meta: { changes: 0 } };
            rows.set(values[0], { id: values[0], candidate_request_hash: values[1], execution_request_hash: values[2], status: "active", issued_at_ms: values[11], expires_at_ms: values[12], consumed_at_ms: null });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql === CONSUME_RECEIPT_SQL) {
            const [consumedAtMs, , id, executionRequestHash, nowMs] = values;
            const row = rows.get(id);
            if (!row || row.status !== "active" || row.execution_request_hash !== executionRequestHash || row.expires_at_ms <= nowMs) return { success: true, meta: { changes: 0 } };
            row.status = "consumed";
            row.consumed_at_ms = consumedAtMs;
            return { success: true, meta: { changes: 1 } };
          }
          if (sql === EXPIRE_RECEIPT_SQL) {
            const [, id, nowMs] = values;
            const row = rows.get(id);
            if (!row || row.status !== "active" || row.expires_at_ms > nowMs) return { success: true, meta: { changes: 0 } };
            row.status = "expired";
            return { success: true, meta: { changes: 1 } };
          }
          throw new Error("unexpected_run_statement");
        },
        async first() {
          if (sql !== INSPECT_RECEIPT_SQL) throw new Error("unexpected_first_statement");
          const row = rows.get(values[0]);
          return row ? { ...row } : null;
        },
      };
    },
  };
}

test("blocks credential files and reports secret assignments without exposing values", () => {
  assert.equal(classifySensitivePath("vendor/lumenx/.env"), "sensitive_env_file");
  assert.equal(classifySensitivePath(".dev.vars"), "cloudflare_dev_vars");
  assert.equal(classifySensitivePath("certificates/private.key"), "private_key_file");
  assert.equal(classifySensitivePath(".env.example"), null);

  const secretValue = ["real", "secret", "value"].join("-");
  const findings = findSecretAssignments(`DASHSCOPE_API_KEY=${secretValue}\nOPENAI_API_KEY=your_api_key`);
  assert.deepEqual(findings, [{ ruleId: "api_key_assignment", line: 1 }]);
  assert.doesNotMatch(JSON.stringify(findings), new RegExp(secretValue));
});

test("shows a non-executing LumenX authorization gate in the console", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /LumenX 连接授权检查/);
  assert.match(page, /尚未检测到 DASHSCOPE_API_KEY/);
  assert.match(page, /再次授权后才会执行可能产生费用的外部模型调用/);
  assert.match(page, /不会创建、读取、上传或测试任何 API Key/);
  assert.match(page, /刷新本机状态/);
  assert.match(page, /fetch\("\/api\/local\/engines", \{ cache:"no-store" \}\)/);
  assert.match(page, /fetch\("\/api\/local\/preflight", \{ cache:"no-store" \}\)/);
  assert.match(page, /fetch\("\/api\/local\/readiness", \{ cache:"no-store" \}\)/);
  assert.match(page, /没有测试密钥、调用模型或产生费用/);
  assert.doesNotMatch(page, /type=["']password["']/);
});

test("requires a cost cap and matching fingerprint before a single pilot can execute", () => {
  const candidate = { inputComplete: true, requestHash: "c".repeat(64) };
  const blocked = validatePilotExecutionApproval({ candidate, credentialConfigured: true, localVoiceReady: true });
  assert.equal(blocked.eligible, false);
  assert.deepEqual(blocked.blockers, ["provider_not_selected", "image_model_not_selected", "video_model_not_selected", "image_cost_not_set", "video_cost_not_set", "pricing_not_confirmed", "max_cost_not_set", "explicit_approval_missing"]);
  assert.equal(blocked.externalCalls, false);
  assert.equal(blocked.costIncurred, false);

  const staleApproval = validatePilotExecutionApproval({ candidate, credentialConfigured: true, localVoiceReady: true, provider: "dashscope", imageModel: "image-model", videoModel: "video-model", imageCostCny: 1, videoCostCny: 2, pricingConfirmed: true, maxCostCny: 5, userApproved: true, approvedRequestHash: "d".repeat(64) });
  assert.equal(staleApproval.eligible, false);
  assert.deepEqual(staleApproval.blockers, ["request_fingerprint_mismatch"]);

  const approvalInput = { candidate, credentialConfigured: true, localVoiceReady: true, provider: "dashscope", imageModel: "image-model", videoModel: "video-model", imageCostCny: 1, videoCostCny: 2, pricingConfirmed: true, maxCostCny: 5 };
  const fingerprintPreview = validatePilotExecutionApproval(approvalInput);
  assert.match(fingerprintPreview.executionRequestHash, /^[a-f0-9]{64}$/);
  assert.notEqual(fingerprintPreview.executionRequestHash, candidate.requestHash);
  const changedQuote = validatePilotExecutionApproval({ ...approvalInput, videoCostCny: 2.01 });
  assert.notEqual(changedQuote.executionRequestHash, fingerprintPreview.executionRequestHash);

  const approved = validatePilotExecutionApproval({ ...approvalInput, userApproved: true, approvedRequestHash: fingerprintPreview.executionRequestHash });
  assert.equal(approved.eligible, true);
  assert.equal(approved.status, "approved_for_single_pilot");
  assert.equal(approved.automaticExecution, false);
  assert.equal(approved.externalCalls, false);

  const overBudgetInput = { ...approvalInput, maxCostCny: 2 };
  const overBudgetFingerprint = validatePilotExecutionApproval(overBudgetInput).executionRequestHash;
  const overBudget = validatePilotExecutionApproval({ ...overBudgetInput, userApproved: true, approvedRequestHash: overBudgetFingerprint });
  assert.deepEqual(overBudget.blockers, ["cost_cap_exceeded"]);
  assert.equal(overBudget.quotedTotalCostCny, 3);
  assert.equal(overBudget.pricingSource, "manual_user_confirmed_quote");
});

test("keeps the pilot execution state machine fail-closed without calling an adapter", () => {
  const candidate = { inputComplete: true, requestHash: "e".repeat(64) };
  const approvalInput = { candidate, credentialConfigured: true, localVoiceReady: true, provider: "dashscope", imageModel: "image-model", videoModel: "video-model", imageCostCny: 1, videoCostCny: 2, pricingConfirmed: true, maxCostCny: 5 };
  const approvedRequestHash = validatePilotExecutionApproval(approvalInput).executionRequestHash;
  const approval = { ...approvalInput, userApproved: true, approvedRequestHash };

  const preview = planPilotExecution(approval);
  assert.equal(preview.state, "awaiting_execution_setup");
  assert.deepEqual(preview.blockers, ["execution_not_requested", "executor_unavailable"]);
  assert.equal(preview.readyForAdapterCall, false);
  assert.equal(preview.executionTriggered, false);
  assert.equal(preview.externalCalls, false);
  assert.equal(preview.costIncurred, false);

  const adapterMissing = planPilotExecution({ ...approval, executionRequested: true });
  assert.deepEqual(adapterMissing.blockers, ["executor_unavailable"]);
  assert.equal(adapterMissing.readyForAdapterCall, false);

  const readyEnvelope = planPilotExecution({ ...approval, executionRequested: true, executorAvailable: true });
  assert.equal(readyEnvelope.state, "awaiting_execution_setup");
  assert.deepEqual(readyEnvelope.blockers, ["authorization_receipt_required"]);
  assert.equal(readyEnvelope.readyForAdapterCall, false);
  assert.equal(readyEnvelope.executionTriggered, false);
  assert.equal(readyEnvelope.generatedMedia, false);
  assert.equal(readyEnvelope.publishable, false);

  let clock = 1_000;
  let receiptNumber = 0;
  const receiptStore = createPilotAuthorizationReceiptStore({ now: () => clock, idFactory: () => `receipt-${++receiptNumber}` });
  const deniedIssue = receiptStore.issue({ gate: { eligible: false, executionRequestHash: approvedRequestHash } });
  assert.deepEqual(deniedIssue.blockers, ["approval_gate_not_eligible"]);
  const issued = receiptStore.issue({ gate: validatePilotExecutionApproval(approval) });
  assert.equal(issued.issued, true);
  assert.equal(issued.receipt.singleUse, true);
  assert.equal(issued.receipt.expiresAtMs, 601_000);

  const noConsent = receiptStore.consume({ receiptId: issued.receipt.id, executionRequestHash: approvedRequestHash });
  assert.equal(noConsent.blocker, "explicit_execution_authorization_missing");
  assert.equal(receiptStore.inspect(issued.receipt.id).status, "active");

  const consumed = receiptStore.consume({ receiptId: issued.receipt.id, executionRequestHash: approvedRequestHash, executionAuthorized: true });
  assert.equal(consumed.consumed, true);
  assert.equal(consumed.executionTriggered, false);
  const authorizedEnvelope = planPilotExecution({ ...approval, executionRequested: true, executorAvailable: true, receiptConsumption: consumed });
  assert.equal(authorizedEnvelope.state, "ready_for_adapter_call");
  assert.equal(authorizedEnvelope.readyForAdapterCall, true);
  assert.equal(authorizedEnvelope.authorizationReceiptConsumed, true);

  const replay = receiptStore.consume({ receiptId: issued.receipt.id, executionRequestHash: approvedRequestHash, executionAuthorized: true });
  assert.equal(replay.blocker, "authorization_receipt_already_consumed");

  const expiring = receiptStore.issue({ gate: validatePilotExecutionApproval(approval) });
  const mismatched = receiptStore.consume({ receiptId: expiring.receipt.id, executionRequestHash: "f".repeat(64), executionAuthorized: true });
  assert.equal(mismatched.blocker, "authorization_receipt_fingerprint_mismatch");
  assert.equal(receiptStore.inspect(expiring.receipt.id).status, "active");
  clock = expiring.receipt.expiresAtMs;
  const expired = receiptStore.consume({ receiptId: expiring.receipt.id, executionRequestHash: approvedRequestHash, executionAuthorized: true });
  assert.equal(expired.blocker, "authorization_receipt_expired");
});

test("checks in a non-destructive durable audit schema for pilot authorization receipts", async () => {
  const [schema, migration, preflight] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_faithful_harry_osborn.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-review-migration.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /sqliteTable\("pilot_authorization_receipts"/);
  assert.match(migration, /CREATE TABLE `pilot_authorization_receipts`/);
  assert.match(migration, /`execution_request_hash` text NOT NULL/);
  assert.match(migration, /`quoted_total_cost_cny` real NOT NULL/);
  assert.match(migration, /`external_calls` integer DEFAULT false NOT NULL/);
  assert.match(migration, /idx_pilot_receipts_execution_hash_issued_at/);
  assert.match(migration, /idx_pilot_receipts_status_expires_at/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i);
  assert.match(preflight, /pilotAuthorizationReceipts/);
  assert.match(preflight, /applied:\s*false/);
});

test("inspects the receipt table and indexes without writing to D1", async () => {
  const d1 = (tableNames, indexNames) => ({
    prepare(sql) {
      return {
        async all() {
          if (sql === INSPECT_RECEIPT_TABLE_SQL) return { results: tableNames.map((name) => ({ name })) };
          if (sql === INSPECT_RECEIPT_INDEXES_SQL) return { results: indexNames.map((name) => ({ name })) };
          throw new Error("unexpected_read_statement");
        },
      };
    },
  });
  const indexes = ["idx_pilot_receipts_execution_hash_issued_at", "idx_pilot_receipts_status_expires_at"];
  const verified = await inspectPilotAuthorizationReceiptStorage(d1(["pilot_authorization_receipts"], indexes));
  assert.equal(verified.status, "verified");
  assert.equal(verified.verified, true);
  assert.deepEqual(verified.blockers, []);
  assert.equal(verified.executionTriggered, false);

  const missing = await inspectPilotAuthorizationReceiptStorage(d1([], []));
  assert.equal(missing.status, "missing");
  assert.deepEqual(missing.blockers, ["migration_missing"]);

  const incomplete = await inspectPilotAuthorizationReceiptStorage(d1(["pilot_authorization_receipts"], indexes.slice(0, 1)));
  assert.equal(incomplete.status, "incomplete");
  assert.deepEqual(incomplete.blockers, ["migration_incomplete"]);
  assert.deepEqual(incomplete.missingIndexes, ["idx_pilot_receipts_status_expires_at"]);
});

test("plans the local receipt migration without applying or mutating D1", async () => {
  const [hosting, migrationSql, script] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../drizzle/0003_faithful_harry_osborn.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-local-d1-migration-readiness.mjs", import.meta.url), "utf8"),
  ]);
  const ready = assessLocalD1MigrationPreflight({ hosting, migrationTag: "0003_faithful_harry_osborn", migrationSql, storageStatus: "missing" });
  assert.equal(ready.readyToApplyLocally, true);
  assert.deepEqual(ready.blockers, []);
  assert.equal(ready.statementCount, 3);
  assert.equal(ready.onlyCreateStatements, true);
  assert.equal(ready.destructiveStatements, false);
  assert.equal(ready.applyPerformed, false);
  assert.equal(ready.databaseWrites, false);

  const alreadyApplied = assessLocalD1MigrationPreflight({ hosting, migrationTag: "0003", migrationSql, storageStatus: "verified" });
  assert.deepEqual(alreadyApplied.blockers, ["migration_already_applied"]);
  const unsafe = assessLocalD1MigrationPreflight({ hosting, migrationTag: "0003", migrationSql: `${migrationSql}\nDROP TABLE ideas;`, storageStatus: "missing" });
  assert.ok(unsafe.blockers.includes("migration_not_create_only"));
  assert.equal(unsafe.readyToApplyLocally, false);
  assert.match(script, /assessLocalD1MigrationPreflight/);
  assert.doesNotMatch(script, /\.prepare\(|\.run\(|\.exec\(|migrations apply/i);
});

test("applies the receipt schema once through a guarded local-only path", async () => {
  let tablePresent = false;
  const indexes = new Set();
  let batchCalls = 0;
  const d1 = {
    prepare(sql) {
      return {
        sql,
        async all() {
          if (sql === INSPECT_RECEIPT_TABLE_SQL) return { results: tablePresent ? [{ name: "pilot_authorization_receipts" }] : [] };
          if (sql === INSPECT_RECEIPT_INDEXES_SQL) return { results: [...indexes].map((name) => ({ name })) };
          throw new Error("unexpected_read_statement");
        },
      };
    },
    async batch(statements) {
      batchCalls += 1;
      assert.deepEqual(statements.map((statement) => statement.sql), [CREATE_RECEIPT_TABLE_SQL, CREATE_RECEIPT_EXECUTION_INDEX_SQL, CREATE_RECEIPT_EXPIRY_INDEX_SQL]);
      tablePresent = true;
      indexes.add("idx_pilot_receipts_execution_hash_issued_at");
      indexes.add("idx_pilot_receipts_status_expires_at");
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };

  const applied = await applyPilotAuthorizationReceiptStorage(d1);
  assert.equal(applied.applied, true);
  assert.equal(applied.databaseWrites, true);
  assert.equal(applied.after.status, "verified");
  assert.equal(applied.externalCalls, false);
  const repeated = await applyPilotAuthorizationReceiptStorage(d1);
  assert.equal(repeated.applied, false);
  assert.equal(repeated.alreadyApplied, true);
  assert.equal(repeated.databaseWrites, false);
  assert.equal(batchCalls, 1);

  const [route, script] = await Promise.all([
    readFile(new URL("../app/api/local/receipt-migration/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/apply-local-receipt-migration.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(route, /isLocalRequest/);
  assert.match(route, /SECRET_FIELD/);
  assert.match(route, /0003_faithful_harry_osborn/);
  assert.match(route, /APPLY_RECEIPT_MIGRATION_LOCALLY/);
  assert.ok(route.indexOf("exact_migration_confirmation_required") < route.indexOf("applyPilotAuthorizationReceiptStorage(getD1())"));
  assert.match(route, /executorEnabled:\s*false/);
  assert.match(route, /executionTriggered:\s*false/);
  assert.match(script, /const execute = args\.has\("--execute"\)/);
  assert.match(script, /execute && \(!tagConfirmed \|\| !localD1Confirmed\)/);
  assert.match(script, /method: execute \? "POST" : "GET"/);
});

test("atomically consumes a durable pilot receipt once and diagnoses failures", async () => {
  const candidate = { inputComplete: true, requestHash: "9".repeat(64) };
  const approvalInput = { candidate, credentialConfigured: true, localVoiceReady: true, provider: "dashscope", imageModel: "image-model", videoModel: "video-model", imageCostCny: 1, videoCostCny: 2, pricingConfirmed: true, maxCostCny: 5 };
  const executionRequestHash = validatePilotExecutionApproval(approvalInput).executionRequestHash;
  const gate = validatePilotExecutionApproval({ ...approvalInput, userApproved: true, approvedRequestHash: executionRequestHash });
  let clock = 1_000;
  const d1 = createFakeReceiptD1();
  const store = createPersistentPilotAuthorizationReceiptStore(d1, { now: () => clock });
  const receiptInput = { gate, receiptId: "durable-1", issuedAtMs: clock, expiresAtMs: 601_000, provider: "dashscope", imageModel: "image-model", videoModel: "video-model", imageCostCny: 1, videoCostCny: 2, quotedTotalCostCny: 3, maxCostCny: 5, pricingConfirmed: true };
  const issued = await store.issue(receiptInput);
  assert.equal(issued.issued, true);
  assert.equal(issued.externalCalls, false);

  const noConsent = await store.consume({ receiptId: "durable-1", executionRequestHash });
  assert.equal(noConsent.blocker, "explicit_execution_authorization_missing");

  const concurrent = await Promise.all([
    store.consume({ receiptId: "durable-1", executionRequestHash, executionAuthorized: true }),
    store.consume({ receiptId: "durable-1", executionRequestHash, executionAuthorized: true }),
  ]);
  assert.equal(concurrent.filter((result) => result.consumed).length, 1);
  assert.equal(concurrent.filter((result) => result.blocker === "authorization_receipt_already_consumed").length, 1);
  const consumed = concurrent.find((result) => result.consumed);
  assert.equal(consumed.durableConsumptionRecorded, true);
  assert.equal(consumed.executionTriggered, false);
  assert.equal(consumed.costIncurred, false);

  await store.issue({ ...receiptInput, receiptId: "durable-2" });
  const mismatch = await store.consume({ receiptId: "durable-2", executionRequestHash: "8".repeat(64), executionAuthorized: true });
  assert.equal(mismatch.blocker, "authorization_receipt_fingerprint_mismatch");

  await store.issue({ ...receiptInput, receiptId: "durable-3", expiresAtMs: 2_000 });
  clock = 2_000;
  const expired = await store.consume({ receiptId: "durable-3", executionRequestHash, executionAuthorized: true });
  assert.equal(expired.blocker, "authorization_receipt_expired");
  assert.equal(d1.rows.get("durable-3").status, "expired");
});

test("composes the real LumenX playground contract without dispatching paid requests", () => {
  const candidate = {
    requestHash: "f".repeat(64),
    imagePrompt: "A vertical science comic frame",
    videoPrompt: "A subtle five-second camera move",
    duration: 5,
    aspectRatio: "9:16",
  };
  const plan = buildLumenXPilotPlan({ candidate });
  assert.equal(plan.ready, true);
  assert.equal(plan.catalogVerification, "local_snapshot_only");
  assert.equal(plan.pricingVerified, false);
  assert.equal(plan.requests.length, 2);
  assert.deepEqual(plan.requests.map((request) => request.body.mode), ["t2i", "i2v"]);
  assert.equal(plan.requests[0].body.model_id, "wan2.7-image-pro");
  assert.equal(plan.requests[0].body.parameters.size, "720*1280");
  assert.equal(plan.requests[1].body.model_id, "happyhorse-1.1-i2v");
  assert.equal(plan.requests[1].body.input_media[0], "{{still_image.outputs[0].media_path}}");
  assert.equal(plan.requests[1].body.parameters.duration, 5);
  assert.equal(plan.dispatchAllowed, false);
  assert.equal(plan.externalCalls, 0);
  assert.equal(plan.costIncurred, false);
  assert.equal(plan.generatedMedia, false);
  assert.doesNotMatch(JSON.stringify(plan), /api[_-]?key|authorization|bearer/i);

  const incomplete = buildLumenXPilotPlan({ candidate: { ...candidate, videoPrompt: "" } });
  assert.equal(incomplete.ready, false);
  assert.deepEqual(incomplete.blockers, ["video_prompt_missing"]);
  assert.deepEqual(incomplete.requests, []);

  const remote = buildLumenXPilotPlan({ candidate, lumenxBaseUrl: "https://example.com" });
  assert.equal(remote.ready, false);
  assert.ok(remote.blockers.includes("lumenx_loopback_required"));
});

test("hands LocalMiniDrama prompts to LumenX in-process while returning only a redacted plan", async () => {
  const fetcher = async (url) => ({
    ok: true,
    json: async () => String(url).includes("video-merges")
      ? { success: true, data: [] }
      : { success: true, data: { id: 1, status: "draft", metadata: { aspect_ratio: "9:16" }, episodes: [{ id: 1, storyboards: [{ id: 11, episode_id: 1, storyboard_number: 1, title: "Pilot", duration: 5, image_prompt: "private image prompt", video_prompt: "private video prompt", narration: "private spoken line" }] }] } },
  });
  const outputs = await inspectLocalMiniDramaOutputs("http://127.0.0.1:5679/api/v1", 1, fetcher);
  const privateInput = getLocalMiniDramaPilotInput(outputs);
  assert.equal(privateInput?.imagePrompt, "private image prompt");
  assert.equal(privateInput?.videoPrompt, "private video prompt");

  const summary = summarizeLumenXPilotPlan(buildLumenXPilotPlan({ candidate: privateInput }));
  assert.equal(summary.contractReady, true);
  assert.deepEqual(summary.steps.map((step) => step.mode), ["t2i", "i2v"]);
  assert.equal(summary.promptBodiesReturned, false);
  assert.equal(summary.requestBodiesReturned, false);
  assert.equal(summary.dispatchAllowed, false);
  assert.equal(summary.externalCalls, 0);
  assert.doesNotMatch(JSON.stringify({ outputs, summary }), /private image prompt|private video prompt|private spoken line/);

  const server = await readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8");
  assert.match(server, /getLocalMiniDramaPilotInput/);
  assert.match(server, /summarizeLumenXPilotPlan/);
  assert.match(server, /lumenxAdapterPlan/);
});

test("exposes a local preview-only approval endpoint that rejects secret fields", async () => {
  const [route, page, styles] = await Promise.all([
    readFile(new URL("../app/api/local/pilot-approval/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /planPilotExecution/);
  assert.match(route, /SECRET_FIELD/);
  assert.match(route, /previewOnly:\s*true/);
  assert.match(route, /executionTriggered:\s*false/);
  assert.match(route, /generatedMedia:\s*false/);
  assert.match(route, /publishable:\s*false/);
  assert.match(route, /executionRequested:\s*false/);
  assert.match(route, /executorAvailable:\s*false/);
  assert.match(route, /executionPlan/);
  assert.doesNotMatch(route, /fetch\([^)]*(?:dashscope|aliyun|alibaba)/i);
  assert.match(page, /\/api\/local\/pilot-approval/);
  assert.match(page, /生成授权预览（不会执行）/);
  assert.match(route, /imageModel:\s*optionalText\(body\.imageModel\)/);
  assert.match(route, /videoModel:\s*optionalText\(body\.videoModel\)/);
  assert.match(route, /imageCostCny:\s*typeof body\.imageCostCny/);
  assert.match(route, /videoCostCny:\s*typeof body\.videoCostCny/);
  assert.match(route, /pricingConfirmed:\s*body\.pricingConfirmed === true/);
  assert.match(page, /imageModel:pilotImageModel/);
  assert.match(page, /videoModel:pilotVideoModel/);
  assert.match(page, /imageCostCny:pilotImageCost/);
  assert.match(page, /videoCostCny:pilotVideoCost/);
  assert.match(page, /pricingConfirmed:pilotPricingConfirmed/);
  assert.match(page, /pilotApprovalReceipt\?\.configKey === configKey/);
  assert.match(page, /payload\.gate\.executionRequestHash/);
  assert.match(page, /最近生成的执行授权指纹/);
  assert.match(page, /模型、报价或预算变化后旧指纹会自动失效/);
  assert.match(page, /人工报价快照/);
  assert.match(page, /系统未联网验证价格/);
  assert.match(page, /图像模型/);
  assert.match(page, /视频模型/);
  assert.match(page, /maxCostCny:pilotMaxCost/);
  assert.match(page, /approvedRequestHash:pilotConsent/);
  assert.match(page, /pilotConsent/);
  assert.doesNotMatch(page, /type=["']password["']/);
  assert.match(styles, /\.pilotPreviewForm/);
});

test("keeps the local pilot execution preparation endpoint closed before receipt consumption", async () => {
  const [route, dbIndex, page, styles] = await Promise.all([
    readFile(new URL("../app/api/local/pilot-execution/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /const EXECUTOR_ENABLED = false/);
  assert.match(route, /isLocalRequest/);
  assert.match(route, /SECRET_FIELD/);
  assert.match(route, /action === "consume" && !EXECUTOR_ENABLED/);
  assert.match(route, /databaseWriteAttempted:\s*false/);
  assert.match(route, /createPersistentPilotAuthorizationReceiptStore\(getD1\(\)\)/);
  assert.match(route, /store\.issue/);
  assert.match(route, /store\.consume/);
  assert.ok(route.indexOf("action === \"consume\" && !EXECUTOR_ENABLED") < route.indexOf("createPersistentPilotAuthorizationReceiptStore(getD1())"));
  assert.match(route, /adapterCallAuthorized:\s*false/);
  assert.match(route, /executionTriggered:\s*false/);
  assert.doesNotMatch(route, /fetch\([^)]*(?:dashscope|aliyun|alibaba)/i);
  assert.match(dbIndex, /export function getD1/);
  assert.match(route, /export async function GET/);
  assert.match(route, /inspectPilotAuthorizationReceiptStorage\(getD1\(\)\)/);
  assert.match(route, /blockers:\s*\["executor_disabled", \.\.\.storage\.blockers\]/);
  assert.match(route, /migrationVerification:\s*storage\.status/);
  assert.match(route, /migrationVerification:\s*"database_unavailable"/);
  assert.match(page, /fetch\("\/api\/local\/pilot-execution"/);
  assert.match(page, /EXECUTION PREPARATION · 只读/);
  assert.match(page, /真实执行保持关闭/);
  assert.match(page, /不提供执行按钮/);
  assert.match(page, /调用 0 · 费用 0 · 发布 0/);
  assert.match(page, /票据迁移尚未应用/);
  assert.match(page, /票据表或索引结构不完整/);
  assert.match(page, /数据库当前不可用/);
  assert.match(styles, /\.executionPreparation/);
  assert.match(page, /fetch\("\/api\/local\/receipt-migration"/);
  assert.match(page, /LOCAL D1 MIGRATION · 只读计划/);
  assert.match(page, /迁移守卫已就绪，等待明确授权/);
  assert.match(page, /本卡不执行迁移/);
  assert.match(page, /默认仅规划 · 无删除语句 · 无模型调用 · 无发布/);
  assert.doesNotMatch(page, /onClick=\{[^}]*applyPilotAuthorizationReceiptStorage/);
  assert.match(styles, /\.migrationReadiness/);
});

test("requires two real source hosts and a citation for every factual claim", async () => {
  const placeholder = validateFactReview({ status: "reviewed", reviewed_at: "2026-08-05", claims: ["claim"], sources: ["https://example.org/source"], claim_citations: [{ claim_index: 0, source_indices: [0] }] });
  assert.equal(placeholder.ready, false);
  assert.ok(placeholder.blockers.includes("sources"));
  assert.ok(placeholder.blockers.includes("claim_citations"));
  assert.equal(placeholder.networkVerification, "not_run");

  const pilot = JSON.parse(await readFile(new URL("../examples/octopus-pilot.json", import.meta.url), "utf8"));
  const result = validateFactReview(pilot.outline.metadata.fact_review);
  assert.equal(result.ready, true);
  assert.equal(result.claimCount, 3);
  assert.equal(result.sourceCount, 3);
  assert.equal(result.distinctHostCount, 3);
  assert.equal(result.citedClaimCount, 3);
  assert.equal(result.networkVerification, "not_run");
});

test("builds a deterministic source-locked script input without calling a model", async () => {
  const pilot = JSON.parse(await readFile(new URL("../examples/octopus-pilot.json", import.meta.url), "utf8"));
  const input = {
    idea: { title: pilot.outline.title, angle: pilot.outline.summary },
    factReview: pilot.outline.metadata.fact_review,
    targets: pilot.outline.metadata.target_platforms,
  };
  const envelope = buildSourceLockedScriptEnvelope(input);

  assert.equal(envelope.ready, true);
  assert.equal(envelope.status, "ready_for_script_generation");
  assert.equal(envelope.claims.length, 3);
  assert.equal(envelope.sources.length, 3);
  assert.ok(envelope.claims.every((claim) => claim.sourceRefs.length > 0));
  assert.match(envelope.inputFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(buildSourceLockedScriptEnvelope(input).inputFingerprint, envelope.inputFingerprint);
  assert.equal(envelope.sourceContentFetched, false);
  assert.equal(envelope.factsGenerated, false);
  assert.equal(envelope.scriptGenerated, false);
  assert.equal(envelope.modelCalls, 0);
  assert.equal(envelope.externalCalls, false);
  assert.equal(envelope.publishTriggered, false);
  assert.equal(envelope.businessResult, false);

  const changed = structuredClone(input);
  changed.factReview.claims[0] += " changed";
  assert.notEqual(buildSourceLockedScriptEnvelope(changed).inputFingerprint, envelope.inputFingerprint);

  const blocked = buildSourceLockedScriptEnvelope({
    idea: input.idea,
    factReview: { ...input.factReview, status: "draft" },
    targets: ["youtube"],
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.inputFingerprint, null);
  assert.ok(blocked.blockers.includes("fact_review:review_status"));
  assert.ok(blocked.blockers.includes("targets:unsupported"));
});

test("plans a source-locked LocalMiniDrama script request while keeping LumenX downstream", async () => {
  const pilot = JSON.parse(await readFile(new URL("../examples/octopus-pilot.json", import.meta.url), "utf8"));
  const envelope = buildSourceLockedScriptEnvelope({
    idea: { title: pilot.outline.title, angle: pilot.outline.summary },
    factReview: pilot.outline.metadata.fact_review,
    targets: pilot.outline.metadata.target_platforms,
  });
  const plan = buildSourceLockedScriptPlan({ envelope });
  const summary = summarizeSourceLockedScriptPlan(plan);

  assert.equal(plan.ready, true);
  assert.equal(plan.request.method, "POST");
  assert.equal(plan.request.url, "http://127.0.0.1:5679/api/v1/generation/story");
  assert.equal(plan.request.body.metadata.source_lock_fingerprint, envelope.inputFingerprint);
  assert.match(plan.request.body.premise, /\[claim-1\]/);
  assert.match(plan.request.body.premise, /\[source-1\] https:\/\//);
  assert.equal(plan.downstream.engine, "LumenX");
  assert.equal(plan.downstream.status, "waiting_for_script_and_storyboards");
  assert.equal(plan.dispatchAllowed, false);
  assert.equal(plan.modelCalls, 0);
  assert.equal(plan.externalCalls, 0);
  assert.equal(plan.scriptGenerated, false);
  assert.equal(summary.readyForAuthorization, true);
  assert.equal(summary.claimCount, 3);
  assert.equal(summary.sourceCount, 3);
  assert.equal(summary.premiseReturned, false);
  assert.equal(summary.requestBodyReturned, false);
  assert.doesNotMatch(JSON.stringify(summary), /章鱼有三颗心脏|ocean\.si\.edu/);

  const blocked = buildSourceLockedScriptPlan({ envelope: { ...envelope, ready: false } });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.request, null);
  assert.equal(blocked.plannedModelCalls, undefined);
  assert.equal(blocked.modelCalls, 0);

  const remote = buildSourceLockedScriptPlan({ envelope, localMiniDramaBaseUrl: "https://example.com/api/v1" });
  assert.equal(remote.ready, false);
  assert.ok(remote.blockers.includes("localminidrama_loopback_required"));
});

test("shows the source-locked script plan in the local console without an execution control", async () => {
  const [route, page, styles] = await Promise.all([
    readFile(new URL("../app/api/local/script-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /buildSourceLockedScriptEnvelope/);
  assert.match(route, /summarizeSourceLockedScriptPlan/);
  assert.match(route, /local_request_required/);
  assert.match(route, /premiseReturned:\s*false/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(page, /fetch\("\/api\/local\/script-plan"/);
  assert.match(page, /SOURCE-LOCKED SCRIPT · 只读/);
  assert.match(page, /不返回完整提示词 · 不执行 · 费用 0 · 不可发布/);
  assert.match(styles, /\.scriptPlanCard/);
});

test("shows an honest read-only script acceptance state before a real script exists", async () => {
  const [route, previewRoute, page, styles] = await Promise.all([
    readFile(new URL("../app/api/local/script-acceptance/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/script-review-preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /assessScriptOutput/);
  assert.match(route, /discoverLocalMiniDramaScriptArtifacts/);
  assert.match(route, /buildScriptReviewDraft/);
  assert.match(route, /"awaiting_human_script_review"/);
  assert.match(route, /"awaiting_script_output"/);
  assert.match(route, /scriptContentReturned: false/);
  assert.doesNotMatch(route, /export async function POST|\.insert\(|\.update\(|\.delete\(/);
  assert.match(previewRoute, /validateScriptReviewPreview/);
  assert.match(previewRoute, /unexpected_or_sensitive_field/);
  assert.match(previewRoute, /scriptContentsReturned: false/);
  assert.match(previewRoute, /databaseWrites: false/);
  assert.doesNotMatch(previewRoute, /\.insert\(|\.update\(|\.delete\(|\.run\(|\.batch\(/);
  assert.match(page, /fetch\("\/api\/local\/script-acceptance"/);
  assert.match(page, /fetch\("\/api\/local\/script-review-preview"/);
  assert.match(page, /SCRIPT ACCEPTANCE · 本机临时复核/);
  assert.match(page, /已发现真实剧本，等待人工复核/);
  assert.match(page, /人工复核草稿/);
  assert.match(page, /setScriptReviewSession/);
  assert.match(page, /session\.outputFingerprint === activeScriptFingerprint/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /打开 LocalMiniDrama 查看真实剧本/);
  assert.match(page, /页面勾选本身不会解锁/);
  assert.match(page, /只有与当前指纹匹配的持久化验收记录/);
  assert.match(page, /检查复核完整性（不保存）/);
  assert.match(page, /复核输入完整，但仍未记录/);
  assert.match(page, /分镜仍锁定/);
  assert.match(page, /系统不自动宣称事实正确/);
  assert.match(styles, /\.scriptAcceptanceCard/);
  assert.match(styles, /\.scriptReviewDraft/);
});

test("keeps source-locked script authorization fail-closed without executing", async () => {
  const sourceLockFingerprint = "b".repeat(64);
  const blocked = validateScriptExecutionApproval({ planReady: true, sourceLockFingerprint });
  assert.deepEqual(blocked.blockers, ["text_credential_missing", "provider_not_selected", "text_model_not_selected", "script_cost_not_set", "pricing_not_confirmed", "max_cost_not_set", "explicit_approval_missing"]);
  assert.equal(blocked.executionRequestHash, null);
  assert.equal(blocked.modelCalls, 0);
  assert.equal(blocked.externalCalls, 0);
  assert.equal(blocked.scriptGenerated, false);

  const approvalInput = { planReady: true, sourceLockFingerprint, credentialConfigured: true, provider: "dashscope", textModel: "qwen-plus", quotedCostCny: 0.25, pricingConfirmed: true, maxCostCny: 1 };
  const preview = validateScriptExecutionApproval(approvalInput);
  assert.match(preview.executionRequestHash, /^[a-f0-9]{64}$/);
  assert.equal(preview.eligible, false);
  assert.deepEqual(preview.blockers, ["explicit_approval_missing"]);

  const approved = validateScriptExecutionApproval({ ...approvalInput, userApproved: true, approvedRequestHash: preview.executionRequestHash });
  assert.equal(approved.eligible, true);
  assert.equal(approved.status, "approved_for_single_script_request");
  assert.equal(approved.automaticExecution, false);
  assert.equal(approved.secretsConsumed, false);

  const changedModel = validateScriptExecutionApproval({ ...approvalInput, textModel: "qwen-max" });
  assert.notEqual(changedModel.executionRequestHash, preview.executionRequestHash);
  const overBudget = validateScriptExecutionApproval({ ...approvalInput, maxCostCny: 0.1, userApproved: true, approvedRequestHash: validateScriptExecutionApproval({ ...approvalInput, maxCostCny: 0.1 }).executionRequestHash });
  assert.ok(overBudget.blockers.includes("cost_cap_exceeded"));
});

test("exposes only a local script authorization preview and rejects secret fields", async () => {
  const [route, page, styles] = await Promise.all([
    readFile(new URL("../app/api/local/script-approval/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /validateScriptExecutionApproval/);
  assert.match(route, /SECRET_FIELD/);
  assert.match(route, /previewOnly:\s*true/);
  assert.match(route, /executorAvailable:\s*false/);
  assert.match(route, /executionTriggered:\s*false/);
  assert.match(route, /modelCalls:\s*0/);
  assert.match(route, /secretsReturned:\s*false/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.doesNotMatch(route, /fetch\([^)]*(?:dashscope|aliyun|alibaba)/i);
  assert.match(page, /fetch\("\/api\/local\/script-approval"/);
  assert.match(page, /textModel:scriptTextModel/);
  assert.match(page, /quotedCostCny:scriptCost/);
  assert.match(page, /pricingConfirmed:scriptPricingConfirmed/);
  assert.match(page, /scriptApprovalFingerprint\?\.configKey === configKey/);
  assert.match(page, /检查授权条件（不会执行）/);
  assert.match(page, /这里只做预览，不执行生成/);
  assert.match(page, /http:\/\/127\.0\.0\.1:3013\/ai-config/);
  assert.match(page, /知绘操作台不提供密钥输入框/);
  assert.match(page, /不会自动测试连接 · 不会读取或回传密钥 · 不会产生模型费用/);
  assert.match(page, /localEngine\.textConfigured/);
  assert.match(styles, /\.scriptApprovalForm/);
  assert.match(styles, /\.scriptConfigGuide/);
});

test("requires distinct complete platform copy and rejects performance promises", () => {
  const valid = validatePlatformPackages(validPlatformCopies);
  assert.equal(valid.ready, true);
  assert.equal(valid.packageCount, 3);
  const risky = validatePlatformPackages({ ...validPlatformCopies, douyin: { ...validPlatformCopies.douyin, caption: "保证百万播放，必爆！" } });
  assert.equal(risky.ready, false);
  assert.equal(risky.performancePromiseDetected, true);
  assert.ok(risky.blockers.includes("douyin:performance_promise"));
});

test("checks source availability without reading content or claiming factual verification", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method });
    if (String(url).includes("restricted")) return { status: 403, url, body: null };
    return { status: 200, url, body: null };
  };
  const result = await checkSourceAvailability(["https://science.example.edu/paper", "https://restricted.example.edu/paper"], { fetcher });
  assert.equal(result.checked, 2);
  assert.equal(result.available, 1);
  assert.equal(result.restricted, 1);
  assert.equal(result.unavailable, 0);
  assert.equal(result.contentRead, false);
  assert.equal(result.factCorrectnessAssessed, false);
  assert.ok(result.results.every((source) => source.bodyRead === false));
  assert.deepEqual(calls.map((call) => call.method), ["HEAD", "HEAD"]);
});

test("falls back to a cancelled range request when a source rejects HEAD", async () => {
  const calls = [];
  let cancelled = false;
  const fetcher = async (url, options) => {
    calls.push(options.method);
    if (options.method === "HEAD") throw new TypeError("HEAD rejected");
    return { status: 206, url, body: { cancel: async () => { cancelled = true; } } };
  };
  const result = await checkSourceAvailability(["https://research.example.edu/paper"], { fetcher });
  assert.equal(result.available, 1);
  assert.equal(result.results[0].method, "GET_RANGE");
  assert.equal(result.results[0].bodyRead, false);
  assert.equal(cancelled, true);
  assert.deepEqual(calls, ["HEAD", "GET"]);
});

test("ships the finished content operations dashboard", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /知绘工厂/);
  assert.match(page, /今日选题/);
  assert.match(page, /生成队列/);
  assert.match(page, /审核交接/);
  assert.match(page, /增长学习/);
  assert.match(page, /生成来源锁定草稿/);
  assert.match(page, /\/api\/local\/generate/);
  assert.match(page, /LumenX 本机适配器/);
  assert.match(page, /生成竖屏静帧/);
  assert.match(page, /静帧生成视频/);
  assert.match(page, /完整提示词不返回/);
  assert.match(page, /外部调用 \{packageReadiness\.lumenxAdapterPlan\.externalCalls\}/);
  assert.match(page, /fetch\("\/api\/news\/platform-text-unified-draft-package-plan"/);
  assert.match(page, /检查双平台草稿包（不会打开平台）/);
  assert.match(page, /浏览器打开 0 · 登录 0 · 上传 0 · 草稿保存 0 · 发布 0/);
  assert.match(page, /fetch\("\/api\/news\/platform-text-durable-review-input-readiness"/);
  assert.match(page, /查询 D1 审核记录（只读）/);
  assert.match(page, /不会保存这里输入的指纹/);
  assert.match(page, /fetch\("\/api\/news\/platform-text-review-receipt-catalog"/);
  assert.match(page, /查找最近审核记录（只读）/);
  assert.match(page, /不会自动配对/);
  assert.match(page, /目录暂不可读/);
  assert.match(page, /存储可读，当前没有真实持久化记录/);
  assert.match(page, /fetch\("\/api\/news\/platform-text-review-storage-readiness"/);
  assert.match(page, /诊断审核表结构（只读）/);
  assert.match(page, /迁移执行 0 · 数据库写入 0/);
  assert.match(page, /fetch\("\/api\/news\/platform-text-review-migration-authorization-preview"/);
  assert.match(page, /预览迁移授权范围（不执行）/);
  assert.match(page, /清单只读 · SQL 不执行 · 命令准备 0 · 执行器连接 0 · 迁移执行 0 · 数据库写入 0/);
  assert.match(page, /migration\.tables\.join\(" · "\)/);
  assert.match(page, /fetch\("\/api\/news\/platform-text-review-migration-isolated-rehearsal"/);
  assert.match(page, /隔离演练 0009\/0010（仅内存）/);
  assert.match(page, /真实 D1 访问 0 · 真实 D1 写入 0 · 正式迁移执行 0/);
  assert.match(page, /fetch\("\/api\/news\/platform-text-review-migration-execution-preflight"/);
  assert.match(page, /检查执行前状态（不授权）/);
  assert.match(page, /确认收到 0 · 授权 0 · 执行器 0 · 正式迁移 0 · 真实 D1 写入 0/);
  assert.match(layout, /知绘工厂/);
  assert.match(css, /\.localProjects/);
  assert.match(css, /\.adapterPlan/);
  assert.match(css, /\.unifiedDraftPackagePlan/);
  assert.match(css, /\.durableReviewInputs/);
  assert.match(css, /\.durableReviewCatalog/);
  assert.match(css, /\.reviewStorageReadiness/);
  assert.match(css, /\.reviewMigrationAuthorizationPreview/);
  assert.match(css, /\.reviewMigrationManifest/);
  assert.match(css, /\.reviewMigrationIsolatedRehearsal/);
  assert.match(css, /\.reviewMigrationExecutionPreflight/);
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});

test("protects and wires the LocalMiniDrama adapter", async () => {
  const [healthRoute, generateRoute, projectsRoute, preflightRoute, readinessRoute, bridgeServer, launcher] = await Promise.all([
    readFile(new URL("../app/api/local/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/generate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/projects/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/preflight/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/readiness/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../start-local-studio.ps1", import.meta.url), "utf8"),
  ]);

  assert.match(healthRoute, /127\.0\.0\.1/);
  assert.match(healthRoute, /\/api\/v1\/ai-configs/);
  assert.match(generateRoute, /\/api\/v1\/dramas/);
  assert.match(generateRoute, /\/api\/v1\/generation\/story/);
  assert.match(generateRoute, /source_idea_id === idea\.id/);
  assert.match(generateRoute, /只能从本机操作台执行/);
  assert.match(projectsRoute, /zhihui-content-os/);
  assert.match(preflightRoute, /diagnoseModelConfigs/);
  assert.match(preflightRoute, /automaticConnectionTests:\s*false/);
  assert.match(readinessRoute, /local_evidence_unavailable/);
  assert.match(readinessRoute, /export async function POST/);
  assert.match(readinessRoute, /真实产物只能从本机操作台同步/);
  assert.match(bridgeServer, /inspectPackageReadiness/);
  assert.match(bridgeServer, /registerLocalMiniDramaArtifacts/);
  assert.match(bridgeServer, /\/readiness\/sync/);
  assert.match(bridgeServer, /Invalid project id/);
  assert.match(launcher, /LocalMiniDrama/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:3765\/health/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /同步真实产物/);
  assert.match(page, /method:"POST"/);
});

test("keeps the pilot packaging fact-gated and human-reviewed", async () => {
  const [packager, pilot] = await Promise.all([
    readFile(new URL("../scripts/build-delivery-package.mjs", import.meta.url), "utf8"),
    readFile(new URL("../examples/octopus-pilot.json", import.meta.url), "utf8"),
  ]);
  assert.match(packager, /Fact review must be completed before packaging/);
  assert.match(packager, /validateFactReview/);
  assert.match(packager, /requires_human_review:\s*true/);
  assert.match(packager, /media_status:\s*"waiting_for_generation"/);
  assert.match(packager, /artifacts:\s*\[\]/);
  assert.match(packager, /positionalArgs/);
  assert.doesNotMatch(packager, /resolve\(process\.argv\[3\]/);
  assert.match(pilot, /"douyin"/);
  assert.match(pilot, /"tiktok"/);
  assert.match(pilot, /"xiaohongshu"/);
});

test("refuses to create a delivery package when claim citations are incomplete", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "zhihui-fact-package-"));
  const weakPilotPath = join(tempRoot, "weak-pilot.json");
  const outputPath = join(tempRoot, "output");
  try {
    const validPilot = JSON.parse(await readFile(new URL("../examples/octopus-pilot.json", import.meta.url), "utf8"));
    validPilot.outline.metadata.fact_review.claim_citations = [];
    await writeFile(weakPilotPath, JSON.stringify(validPilot), "utf8");
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../scripts/build-delivery-package.mjs", import.meta.url)),
      weakPilotPath,
      outputPath,
      "--offline",
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /claim_citations/);
    await assert.rejects(access(outputPath));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("promotes only verified production artifacts to review_pending", () => {
  const manifest = {
    fact_review: { status: "reviewed", reviewed_at: "2026-08-05", claims: ["verified claim"], sources: ["https://science.nasa.gov/source", "https://ocean.si.edu/source"], claim_citations: [{ claim_index: 0, source_indices: [0, 1] }] },
    platforms: ["douyin", "tiktok", "xiaohongshu"],
    platform_copy: validPlatformCopies,
    media_status: "ready_for_review",
    requires_human_review: true,
  };
  const waiting = validateProductionReadiness({ ...manifest, media_status: "waiting_for_generation" }, []);
  assert.equal(waiting.eligible, false);
  assert.ok(waiting.blockers.includes("media_status"));
  assert.ok(waiting.blockers.includes("artifacts"));

  const verified = validateProductionReadiness(manifest, [
    { kind: "video", verified: true },
    { kind: "audio", verified: true },
    { kind: "subtitles", verified: true },
  ]);
  assert.equal(verified.eligible, true);
  assert.equal(verified.nextStatus, "review_pending");

  const smokeAudio = validateProductionReadiness(manifest, [
    { kind: "video", verified: true },
    { kind: "audio", verified: true, eligibleForProduction: false },
    { kind: "subtitles", verified: true },
  ]);
  assert.equal(smokeAudio.eligible, false);
  assert.ok(smokeAudio.blockers.includes("artifacts"));
  assert.equal(classifyArtifactForProduction({ file: "outputs/cosyvoice-smoke/smoke-001.wav" }).eligibleForProduction, false);
});

test("keeps checksum-valid smoke audio outside production readiness", async () => {
  const packageRoot = await mkdtemp(join(tmpdir(), "zhihui-smoke-policy-"));
  try {
    await Promise.all([
      writeFile(join(packageRoot, "final.mp4"), "real video bytes"),
      writeFile(join(packageRoot, "smoke-voice.wav"), "real smoke audio bytes"),
      writeFile(join(packageRoot, "subtitles.srt"), "real subtitle bytes"),
      ...Object.entries(validPlatformCopies).map(([platform, copy]) => writeFile(join(packageRoot, `${platform}.json`), JSON.stringify(copy))),
    ]);
    const artifacts = await Promise.all([
      ["video", "final.mp4"],
      ["audio", "smoke-voice.wav"],
      ["subtitles", "subtitles.srt"],
    ].map(async ([kind, file]) => ({ kind, file, sha256: await sha256(join(packageRoot, file)) })));
    await writeFile(join(packageRoot, "manifest.json"), JSON.stringify({
      project_id: "policy-test",
      fact_review: { status: "reviewed", reviewed_at: "2026-08-05", claims: ["verified claim"], sources: ["https://science.nasa.gov/source", "https://ocean.si.edu/source"], claim_citations: [{ claim_index: 0, source_indices: [0, 1] }] },
      platforms: ["douyin", "tiktok", "xiaohongshu"],
      platform_packages: {
        douyin: { file: "douyin.json", language: "zh-CN" },
        tiktok: { file: "tiktok.json", language: "en-US" },
        xiaohongshu: { file: "xiaohongshu.json", language: "zh-CN" },
      },
      media_status: "ready_for_review",
      requires_human_review: true,
      artifacts,
    }, null, 2));

    const result = await inspectPackageReadiness(join(packageRoot, "manifest.json"));
    const audio = result.artifactChecks.find((artifact) => artifact.kind === "audio");
    assert.equal(audio?.verified, true);
    assert.equal(audio?.eligibleForProduction, false);
    assert.equal(audio?.reason, "smoke_or_non_production_artifact");
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.includes("artifacts"));
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("discovers LocalMiniDrama outputs without inventing missing media", async () => {
  const fetcher = async (url) => ({
    ok: true,
    json: async () => String(url).includes("video-merges")
      ? { success: true, data: [] }
      : { success: true, data: { id: 1, status: "draft", metadata: { aspect_ratio: "9:16" }, episodes: [{ id: 1, video_url: null, storyboards: [{ id: 11, episode_id: 1, storyboard_number: 1, title: "Pilot", duration: 5, image_prompt: "image prompt", video_prompt: "video prompt", narration: "spoken line", video_url: null, audio_local_path: null, narration_audio_local_path: null }] }] } },
  });
  const result = await inspectLocalMiniDramaOutputs("http://127.0.0.1:5679/api/v1", 1, fetcher);
  assert.equal(result.storyboardCount, 1);
  assert.equal(result.sceneVideoCount, 0);
  assert.equal(result.storyboardAudioReadyCount, 0);
  assert.equal(result.audioFileCount, 0);
  assert.equal(result.finalVideoCount, 0);
  assert.equal(result.completedMergeCount, 0);
  assert.equal(result.pilotCandidate?.storyboardId, 11);
  assert.equal(result.pilotCandidate?.inputComplete, true);
  assert.equal(result.pilotCandidate?.promptsReturned, false);
  assert.match(result.pilotCandidate?.requestHash ?? "", /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result.pilotCandidate), /image prompt|video prompt|spoken line/);
});

test("turns real artifact counts into a non-executing generation plan", () => {
  const result = buildGenerationPlan({ storyboardCount: 6, sceneVideoCount: 0, storyboardAudioReadyCount: 0, finalVideoCount: 0, completedMergeCount: 0, pilotCandidate: { storyboardId: 11, storyboardNumber: 1, title: "Pilot", duration: 5, aspectRatio: "9:16", requestHash: "a".repeat(64), inputComplete: true, promptsReturned: false } }, {
    eligible: false,
    artifactChecks: [{ kind: "subtitles", verified: true, eligibleForProduction: true }],
  }, [
    { id: "localminidrama", ready: true, status: "ready", action: "continue" },
    { id: "lumenx", ready: false, status: "external_configuration_required", action: "configure model" },
    { id: "cosyvoice", ready: false, status: "model_weights_missing", action: "download after approval" },
  ]);
  assert.equal(result.automaticExecution, false);
  assert.equal(result.generatedMedia, false);
  assert.deepEqual(result.nextStageIds, ["scene_video", "voice", "merge", "package"]);
  assert.equal(result.stages.find((stage) => stage.id === "scene_video")?.blockerCode, "external_configuration_required");
  assert.equal(result.stages.find((stage) => stage.id === "voice")?.blockerCode, "model_weights_missing");
  assert.equal(result.stages.find((stage) => stage.id === "merge")?.blockerCode, "upstream_artifacts_missing");
  assert.equal(result.stages.find((stage) => stage.id === "voice")?.authorizationRequired, true);
  assert.equal(result.pilotApproval?.externalModelCalls, 2);
  assert.equal(result.pilotApproval?.localInferenceCalls, 1);
  assert.equal(result.pilotApproval?.userApproved, false);
  assert.equal(result.pilotApproval?.readyToExecute, false);
  assert.equal(result.pilotApproval?.executionGate.eligible, false);
  assert.deepEqual(result.pilotApproval?.executionGate.blockers, ["external_credential_missing", "local_voice_not_ready", "provider_not_selected", "image_model_not_selected", "video_model_not_selected", "image_cost_not_set", "video_cost_not_set", "pricing_not_confirmed", "max_cost_not_set", "explicit_approval_missing"]);
  assert.equal(result.pilotApproval?.willExecute, false);
  assert.equal(result.pilotApproval?.publishable, false);
  assert.equal(result.pilotApproval?.requestHash, "a".repeat(64));
  assert.deepEqual(result.stages.map((stage) => [stage.id, stage.completed, stage.total]), [
    ["storyboards", 6, 6],
    ["scene_video", 0, 6],
    ["voice", 0, 6],
    ["merge", 0, 1],
    ["package", 0, 1],
  ]);
});

test("registers only real local artifacts and stays idempotent", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "zhihui-artifacts-"));
  const packageRoot = join(tempRoot, "package");
  const storageRoot = join(tempRoot, "storage");
  const manifestPath = join(packageRoot, "manifest.json");
  try {
    await mkdir(packageRoot, { recursive: true });
    await mkdir(storageRoot, { recursive: true });
    await writeFile(join(packageRoot, "subtitles.srt"), "1\n00:00:00,000 --> 00:00:01,000\nverified subtitle\n");
    await writeFile(join(storageRoot, "final.mp4"), "verified video bytes");
    await writeFile(join(storageRoot, "voice.wav"), "verified audio bytes");
    await writeFile(manifestPath, JSON.stringify({ subtitle_file: "subtitles.srt", media_status: "waiting_for_generation", artifacts: [] }, null, 2));
    const engineOutputs = { candidates: { finalVideos: [{ url: "/static/final.mp4" }], completedMerges: [], audioFiles: ["voice.wav"] } };

    const first = await registerLocalMiniDramaArtifacts({ manifestPath, engineOutputs, storageRoots: [storageRoot] });
    const second = await registerLocalMiniDramaArtifacts({ manifestPath, engineOutputs, storageRoots: [storageRoot] });
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(manifest.media_status, "ready_for_review");
    assert.deepEqual(new Set(manifest.artifacts.map((artifact) => artifact.kind)), new Set(["video", "audio", "subtitles"]));
    assert.ok(manifest.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("does not promote manifest-only artifact claims", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "zhihui-unverified-"));
  const manifestPath = join(tempRoot, "manifest.json");
  try {
    await writeFile(join(tempRoot, "subtitles.srt"), "real subtitle");
    await writeFile(manifestPath, JSON.stringify({
      subtitle_file: "subtitles.srt",
      media_status: "waiting_for_generation",
      artifacts: [
        { kind: "video", file: "missing.mp4", sha256: "a".repeat(64) },
        { kind: "audio", file: "missing.wav", sha256: "b".repeat(64) },
      ],
    }, null, 2));
    const result = await registerLocalMiniDramaArtifacts({ manifestPath, engineOutputs: { candidates: {} } });
    assert.equal(result.mediaStatus, "waiting_for_generation");
    assert.deepEqual(result.missingKinds, ["video", "audio"]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("refuses to register smoke outputs as production media", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "zhihui-smoke-register-"));
  const packageRoot = join(tempRoot, "package");
  const storageRoot = join(tempRoot, "storage");
  const manifestPath = join(packageRoot, "manifest.json");
  try {
    await Promise.all([mkdir(packageRoot, { recursive: true }), mkdir(storageRoot, { recursive: true })]);
    await writeFile(join(storageRoot, "smoke-voice.wav"), "checksum-valid smoke bytes");
    await writeFile(manifestPath, JSON.stringify({ media_status: "waiting_for_generation", artifacts: [] }, null, 2));
    await assert.rejects(
      registerLocalMiniDramaArtifacts({
        manifestPath,
        engineOutputs: { candidates: { audioFiles: ["smoke-voice.wav"] } },
        storageRoots: [storageRoot],
      }),
      /Smoke\/test artifacts cannot be registered/,
    );
    await assert.rejects(access(join(packageRoot, "media", "audio-001-smoke-voice.wav")));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("diagnoses model configuration without testing or exposing secrets", () => {
  const missing = diagnoseModelConfigs([]);
  assert.deepEqual(missing.map((stage) => stage.diagnosticCode), Array(4).fill("missing_configuration"));
  assert.ok(missing.every((stage) => stage.automaticTest === false && stage.verification === "not_run"));

  const secret = "do-not-expose-this-key";
  const configured = diagnoseModelConfigs([{ service_type: "video", provider: "provider", base_url: "https://example.invalid", api_key: secret, model: ["video-model"], is_active: true }]);
  const video = configured.find((stage) => stage.id === "video");
  assert.equal(video?.diagnosticCode, "configured_unverified");
  assert.equal(video?.ready, true);
  assert.doesNotMatch(JSON.stringify(configured), new RegExp(secret));
});

test("reports local engine code separately from missing model weights", async () => {
  const result = await inspectLocalEngines(new URL("../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"), async () => ({ ok: true }));
  const cosyVoice = result.engines.find((engine) => engine.id === "cosyvoice");
  const museTalk = result.engines.find((engine) => engine.id === "musetalk");
  assert.equal(result.automaticDownloads, false);
  assert.equal(cosyVoice?.codePresent, true);
  assert.equal(cosyVoice?.modelReady, false);
  assert.equal(cosyVoice?.status, "model_weights_missing");
  assert.equal(museTalk?.codePresent, true);
  assert.equal(museTalk?.modelReady, false);
  assert.equal(museTalk?.status, "model_weights_missing");
});

test("diagnoses LumenX credentials without returning or testing secrets", async () => {
  const missing = assessLumenXConfiguration(new Set(), []);
  assert.equal(missing.readyForPilot, false);
  assert.equal(missing.status, "missing_required_credential");
  assert.equal(missing.externalCalls, false);
  assert.equal(missing.costIncurred, false);

  const secret = "never-return-this-dashscope-key";
  const configured = await inspectLumenXConfiguration(
    new URL("../vendor/lumenx", import.meta.url).pathname.replace(/^\/(.:)/, "$1"),
    { DASHSCOPE_API_KEY: secret },
    new URL("../does-not-exist.json", import.meta.url).pathname,
  );
  assert.equal(configured.readyForPilot, true);
  assert.equal(configured.status, "configured_unverified");
  assert.equal(configured.secretsReturned, false);
  assert.doesNotMatch(JSON.stringify(configured), new RegExp(secret));
});

test("preflights CosyVoice without downloading or claiming runtime readiness", () => {
  const result = assessCosyVoiceInstallPreflight({ gpuName: "RTX 4060", gpuMemoryMiB: 8188, freeBytes: 171_000_000_000, condaInstalled: true, dedicatedEnvPresent: false, currentPython: "3.14.3", ffmpegReady: true });
  assert.equal(result.disk.ready, true);
  assert.equal(result.hardware.gpuAssessment, "candidate_unverified");
  assert.equal(result.runtime.ready, false);
  assert.equal(result.readyToPrepareEnvironment, true);
  assert.equal(result.readyToRun, false);
  assert.equal(result.planAvailable, true);
  assert.equal(result.planCommand, "npm run cosyvoice:plan");
  assert.equal(result.smokePlanAvailable, true);
  assert.equal(result.smokePlanCommand, "npm run cosyvoice:smoke:plan");
  assert.equal(result.approvalRequired, true);
  assert.equal(result.downloadTriggered, false);
});

test("preflights MuseTalk as an optional lip-sync route without downloading or inferring", async () => {
  const result = assessMuseTalkInstallPreflight({ gpuName: "RTX 4060", gpuMemoryMiB: 8188, freeBytes: 170_000_000_000, condaInstalled: true, dedicatedEnvPresent: false, currentPython: "3.14.3", ffmpegReady: true, requiredModelFiles: 9, presentModelFiles: 0 });
  assert.equal(result.hardware.gpuAssessment, "candidate_unverified");
  assert.equal(result.hardware.performanceClaim, "not_tested_on_this_device");
  assert.equal(result.disk.requiredFreeBytes, null);
  assert.equal(result.disk.ready, null);
  assert.equal(result.model.ready, false);
  assert.equal(result.readyForSmokeTest, false);
  assert.equal(result.readyForProduction, false);
  assert.equal(result.routePolicy.defaultForScienceComic, false);
  assert.deepEqual(result.routePolicy.requiredInputs, ["face_video_or_image", "narration_audio"]);
  assert.equal(result.downloadTriggered, false);
  assert.equal(result.inferenceTriggered, false);
  assert.equal(result.generatedMedia, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.costIncurred, false);

  const [server, page, styles] = await Promise.all([
    readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(server, /inspectMuseTalkInstallPreflight/);
  assert.match(server, /museTalk\.lipSyncPreflight = museTalkPreflight/);
  assert.match(page, /MUSETALK · 数字人口型备选/);
  assert.match(page, /科普漫剧默认不启用；仅在明确选择数字人口播时使用/);
  assert.match(page, /下载 0 · 推理 0 · 成片 0 · 费用 0/);
  assert.match(styles, /\.museTalkPreflight/);
});

test("preflights MoneyPrinterTurbo without reading credentials or trusting stock-media rights", async () => {
  const result = assessMoneyPrinterPreflight({ codePresent: true, configPresent: true, dedicatedEnvPresent: false, ffmpegReady: true, currentPython: "3.14.3", bundledMusicCount: 29 });
  assert.equal(result.engine.configurationPresent, true);
  assert.equal(result.engine.configurationRead, false);
  assert.equal(result.engine.secretsReturned, false);
  assert.ok(result.blockers.includes("configuration_not_read_secret_boundary"));
  assert.ok(result.blockers.includes("source_rights_unverified"));
  assert.ok(result.blockers.includes("facts_not_verified"));
  assert.equal(result.sourcePolicy.recommendedUntilReview, "licensed_local");
  assert.equal(result.sourcePolicy.bundledMusicAllowedForProduction, false);
  assert.equal(result.factPolicy.mayEstablishNewsFacts, false);
  assert.equal(result.factPolicy.upstreamFactReviewRequired, true);
  assert.equal(result.routePolicy.automaticPublish, false);
  assert.equal(result.readyForSmokeTest, false);
  assert.equal(result.readyForProduction, false);
  assert.equal(result.automaticDownloads, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.generatedMedia, false);
  assert.equal(result.publishTriggered, false);

  const [server, page, styles] = await Promise.all([
    readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(server, /inspectMoneyPrinterPreflight/);
  assert.match(server, /moneyPrinter\.contentPreflight = moneyPrinterPreflight/);
  assert.match(page, /MONEYPRINTERTURBO · 资讯口播备选/);
  assert.match(page, /只能使用已审核来源起草，不能自行确立新闻事实/);
  assert.match(page, /抓取 0 · 素材下载 0 · 成片 0 · 发布 0/);
  assert.match(styles, /\.moneyPrinterPreflight/);
});

test("diagnoses a stale local bridge without restarting or mutating its process", async () => {
  const stale = assessBridgeProtocol({ ok: true, engines: 5 });
  assert.equal(stale.status, "stale");
  assert.equal(stale.reportedVersion, null);
  assert.deepEqual(stale.missingCapabilities, BRIDGE_CAPABILITIES);
  assert.equal(stale.restartRequired, true);
  assert.equal(stale.restartTriggered, false);
  assert.equal(stale.processMutation, false);
  const current = assessBridgeProtocol({ protocolVersion: BRIDGE_PROTOCOL_VERSION, capabilities: BRIDGE_CAPABILITIES });
  assert.equal(current.status, "current");
  assert.equal(current.restartRequired, false);
  assert.deepEqual(current.blockers, []);

  const [server, route, page, styles, launcher, restartPlan, parallelVerification] = await Promise.all([
    readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/bridge-status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../start-local-studio.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/restart-local-bridge.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/verify-bridge-parallel.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(server, /protocolVersion: BRIDGE_PROTOCOL_VERSION/);
  assert.match(server, /capabilities: BRIDGE_CAPABILITIES/);
  assert.match(server, /\/d1\/migration-chain\/isolated/);
  assert.match(route, /isLocalRequest/);
  assert.match(route, /assessBridgeProtocol/);
  assert.match(route, /restartTriggered:\s*false/);
  assert.match(route, /processMutation:\s*false/);
  assert.doesNotMatch(route, /Stop-Process|taskkill|process\.kill|spawn\(/);
  assert.match(page, /fetch\("\/api\/local\/bridge-status"/);
  assert.match(page, /桥接服务需要安全重启/);
  assert.match(page, /自动重启/);
  assert.match(styles, /\.bridgeStatus/);
  assert.match(launcher, /\$ExpectedBridgeProtocol = 3/);
  assert.match(launcher, /Get-BridgeProtocolStatus/);
  for (const capability of BRIDGE_CAPABILITIES) {
    assert.match(launcher, new RegExp(capability));
  }
  assert.match(launcher, /bridge is stale/);
  assert.match(launcher, /Close the old Zhihui local studio processes/);
  assert.doesNotMatch(launcher, /Stop-Process|taskkill|process\.kill/);
  assert.match(restartPlan, /param\(\[switch\]\$Execute\)/);
  assert.match(restartPlan, /if \(-not \$Execute\)/);
  assert.match(restartPlan, /bridge_signature_changed_abort/);
  assert.match(restartPlan, /bridge_process_identity_mismatch/);
  assert.match(restartPlan, /127\.0\.0\.1:3765/);
  assert.match(restartPlan, /processMutation = \$false/);
  assert.doesNotMatch(restartPlan, /taskkill|Stop-Process\s+-Name|Get-Process\s+node/);
  assert.match(server, /ZHIHUI_BRIDGE_PORT/);
  assert.match(parallelVerification, /const port = 3766/);
  assert.match(parallelVerification, /oldBridgeMutated:\s*false/);
  assert.match(parallelVerification, /child\.kill\(\)/);
  assert.match(parallelVerification, /temporaryBridgeStopped:\s*true/);
  assert.doesNotMatch(parallelVerification, /Stop-Process|taskkill|3765/);
});

test("diagnoses the full local runtime without restarting services", async () => {
  const currentFetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => url.includes(":3765/")
      ? { protocolVersion: BRIDGE_PROTOCOL_VERSION, capabilities: BRIDGE_CAPABILITIES }
      : {},
  });
  const current = await inspectLocalRuntime({ fetchImpl: currentFetch, timeoutMs: 50 });
  assert.equal(current.status, "current");
  assert.equal(current.current, true);
  assert.equal(current.services.length, LOCAL_RUNTIME_SERVICES.length);
  assert.deepEqual(current.offlineServices, []);
  assert.equal(current.nextAction, "none");

  const stale = await inspectLocalRuntime({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    timeoutMs: 50,
  });
  assert.equal(stale.status, "bridge_stale");
  assert.equal(stale.bridgeProtocol.restartRequired, true);
  assert.equal(stale.nextAction, "close_old_studio_and_rerun_launcher");

  const offline = await inspectLocalRuntime({
    fetchImpl: async (url) => {
      if (url.includes(":3013")) throw new Error("offline");
      return { ok: true, status: 200, json: async () => ({ protocolVersion: BRIDGE_PROTOCOL_VERSION, capabilities: BRIDGE_CAPABILITIES }) };
    },
    timeoutMs: 50,
  });
  assert.equal(offline.status, "services_offline");
  assert.deepEqual(offline.offlineServices, ["local_mini_drama_web"]);
  assert.equal(offline.nextAction, "run_start_local_studio");
  assert.equal(offline.processMutation, false);
  assert.equal(offline.externalCalls, false);
  assert.equal(offline.modelCalls, false);
  assert.equal(offline.publishTriggered, false);

  const [doctorScript, packageJson, runtimeRoute, page, styles] = await Promise.all([
    readFile(new URL("../scripts/check-local-runtime.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/runtime-status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(doctorScript, /inspectLocalRuntime/);
  assert.doesNotMatch(doctorScript, /Stop-Process|taskkill|process\.kill|spawn\(/);
  assert.match(packageJson, /"local:doctor": "node scripts\/check-local-runtime\.mjs"/);
  assert.match(runtimeRoute, /isLocalRequest/);
  assert.match(runtimeRoute, /inspectLocalRuntime/);
  assert.doesNotMatch(runtimeRoute, /Stop-Process|taskkill|process\.kill|spawn\(/);
  assert.match(page, /fetch\("\/api\/local\/runtime-status"/);
  assert.match(page, /LOCAL RUNTIME · 只读体检/);
  assert.match(page, /重启 0 · 下载 0 · 模型调用 0 · 发布 0/);
  assert.match(styles, /\.runtimeStatus/);
});

test("excludes metrics without platform provenance and disables unverified writes", async () => {
  const legacyRow = { platform: "douyin", views: 100, likes: 10, comments: 2, shares: 1, saves: 3, completionRate: 40 };
  assert.equal(validateMetricProvenance(legacyRow).verified, false);
  const excluded = filterVerifiedMetrics([legacyRow]);
  assert.deepEqual(excluded.metrics, []);
  assert.equal(excluded.recordsExcluded, 1);
  assert.equal(excluded.status, "awaiting_verified_import");

  const verifiedRow = {
    ...legacyRow,
    sourceKind: "platform_export",
    externalPostId: "douyin-post-1",
    capturedAt: "2026-08-08T10:00:00.000Z",
  };
  assert.deepEqual(validateMetricProvenance(verifiedRow), { verified: true, missing: [] });
  const verified = filterVerifiedMetrics([legacyRow, verifiedRow]);
  assert.deepEqual(verified.metrics, [verifiedRow]);
  assert.equal(verified.recordsExcluded, 1);
  assert.equal(verified.realDataOnly, true);
  assert.equal(verified.writePerformed, false);

  const createD1 = ({ columns, indexes }) => ({
    prepare: (sql) => ({
      all: async () => ({ results: sql.startsWith("PRAGMA") ? columns.map((name) => ({ name })) : indexes.map((name) => ({ name })) }),
    }),
  });
  const missingStorage = await inspectMetricsProvenanceStorage(createD1({ columns: [], indexes: [] }));
  assert.equal(missingStorage.status, "missing_table");
  assert.deepEqual(missingStorage.blockers, ["metrics_table_missing"]);
  const incompleteStorage = await inspectMetricsProvenanceStorage(createD1({ columns: ["id", "platform"], indexes: [] }));
  assert.equal(incompleteStorage.status, "incomplete");
  assert.deepEqual(incompleteStorage.missingColumns, REQUIRED_METRICS_PROVENANCE_COLUMNS);
  assert.equal(incompleteStorage.databaseWrites, false);
  const verifiedStorage = await inspectMetricsProvenanceStorage(createD1({
    columns: ["id", "platform", ...REQUIRED_METRICS_PROVENANCE_COLUMNS],
    indexes: [REQUIRED_METRICS_PROVENANCE_INDEX],
  }));
  assert.equal(verifiedStorage.status, "verified");
  assert.equal(verifiedStorage.verified, true);
  assert.deepEqual(verifiedStorage.missingColumns, []);

  const createSchemaD1 = ({ objects, columns }) => ({
    prepare: (sql) => ({
      all: async () => ({ results: sql.startsWith("PRAGMA") ? columns.map((name) => ({ name })) : objects }),
    }),
  });
  const emptyChain = await inspectMigrationChain(createSchemaD1({ objects: [], columns: [] }));
  assert.equal(emptyChain.status, "empty");
  assert.equal(emptyChain.completedSteps, 0);
  assert.equal(emptyChain.totalSteps, MIGRATION_CHAIN.length);
  assert.equal(emptyChain.firstPending, "0000_serious_tinkerer");
  assert.deepEqual(emptyChain.blockers, ["full_migration_chain_missing"]);
  assert.equal(emptyChain.databaseWrites, false);
  const completeObjects = MIGRATION_CHAIN.flatMap((step) => step.artifacts)
    .filter((artifact) => !artifact.startsWith("column:"))
    .map((artifact) => {
      const [type, name] = artifact.split(":");
      return { type, name };
    });
  const completeColumns = MIGRATION_CHAIN.flatMap((step) => step.artifacts)
    .filter((artifact) => artifact.startsWith("column:"))
    .map((artifact) => artifact.slice(7));
  const currentChain = await inspectMigrationChain(createSchemaD1({ objects: completeObjects, columns: completeColumns }));
  assert.equal(currentChain.status, "current");
  assert.equal(currentChain.current, true);
  assert.equal(currentChain.completedSteps, MIGRATION_CHAIN.length);
  assert.equal(currentChain.firstPending, null);
  const chainMigrations = await Promise.all(MIGRATION_CHAIN.map(async ({ tag }) => ({ tag, sql: await readFile(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8") })));
  const chainPlan = buildD1ChainPlan({ journalEntries: MIGRATION_CHAIN.map(({ tag }) => ({ tag })), migrations: chainMigrations, liveStatus: emptyChain });
  assert.equal(chainPlan.sourcePlanReady, true);
  assert.equal(chainPlan.liveStateVerified, true);
  assert.equal(chainPlan.readyForAuthorizedApply, true);
  assert.equal(chainPlan.authorizationRequired, true);
  assert.deepEqual(chainPlan.unsafeFiles, []);
  assert.deepEqual(chainPlan.unsupportedStatements, []);
  assert.equal(chainPlan.applyPerformed, false);
  assert.equal(chainPlan.databaseWrites, false);
  const ledgerBlockedPlan = buildD1ChainPlan({ journalEntries: MIGRATION_CHAIN.map(({ tag }) => ({ tag })), migrations: chainMigrations, liveStatus: { ...emptyChain, migrationLedgerObjects: ["d1_migrations"] } });
  assert.equal(ledgerBlockedPlan.readyForAuthorizedApply, false);
  assert.ok(ledgerBlockedPlan.blockers.includes("migration_ledger_requires_review"));

  const defaultApplyGuard = assessD1ChainApplyRequest({ plan: chainPlan });
  assert.equal(defaultApplyGuard.mode, "plan_only");
  assert.equal(defaultApplyGuard.eligible, false);
  assert.ok(defaultApplyGuard.blockers.includes("execute_request_missing"));
  assert.ok(defaultApplyGuard.blockers.includes("confirmation_mismatch"));
  assert.equal(defaultApplyGuard.executorInvoked, false);
  assert.equal(defaultApplyGuard.databaseWrites, false);
  const wrongConfirmationGuard = assessD1ChainApplyRequest({ plan: chainPlan, executeRequested: true, confirmation: "wrong" });
  assert.equal(wrongConfirmationGuard.eligible, false);
  assert.deepEqual(wrongConfirmationGuard.blockers, ["confirmation_mismatch"]);
  const eligibleApplyGuard = assessD1ChainApplyRequest({ plan: chainPlan, executeRequested: true, confirmation: FULL_CHAIN_CONFIRMATION });
  assert.equal(eligibleApplyGuard.mode, "authorized_local_apply");
  assert.equal(eligibleApplyGuard.status, "ready_for_manual_local_apply");
  assert.equal(eligibleApplyGuard.eligible, true);
  assert.equal(eligibleApplyGuard.commandPrepared, true);
  assert.deepEqual(eligibleApplyGuard.command, {
    executable: "npx",
    args: ["wrangler", "d1", "migrations", "apply", "DB", "--local"],
    targetBinding: "DB",
    remote: false,
  });
  assert.equal(eligibleApplyGuard.manualExecutionRequired, true);
  assert.equal(eligibleApplyGuard.executorInvoked, false);
  assert.equal(eligibleApplyGuard.applyPerformed, false);
  const ledgerApplyGuard = assessD1ChainApplyRequest({ plan: ledgerBlockedPlan, executeRequested: true, confirmation: FULL_CHAIN_CONFIRMATION });
  assert.equal(ledgerApplyGuard.eligible, false);
  assert.ok(ledgerApplyGuard.blockers.includes("migration_ledger_requires_review"));
  const executionManifest = buildD1ChainExecutionManifest({ plan: chainPlan, isolatedVerification: { verified: true, ephemeralDatabaseWrites: true }, migrations: chainMigrations });
  assert.equal(executionManifest.readyForAuthorization, true);
  assert.equal(executionManifest.steps.length, MIGRATION_CHAIN.length);
  assert.match(executionManifest.chainFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(executionManifest.sqlBodiesReturned, false);
  assert.equal(executionManifest.executionAdapterConnected, false);
  assert.equal(executionManifest.executionCommandPrepared, false);
  assert.equal(executionManifest.liveDatabaseWrites, false);
  assert.equal(JSON.stringify(executionManifest).includes("NOT NULL"), false);
  assert.equal(JSON.stringify(executionManifest).includes("`"), false);

  const [route, migrationRoute, chainRoute, isolatedRoute, chainPlanScript, chainApplyScript, isolatedVerifyScript, isolatedVerifier, packageJson, page, styles, schema, migration, preflightScript] = await Promise.all([
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/metrics-migration/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/migration-chain/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/migration-chain-verification/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/plan-local-d1-chain.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/apply-local-d1-chain.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/verify-d1-chain-in-memory.mjs", import.meta.url), "utf8"),
    readFile(new URL("../db/isolated-migration-verifier.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_strange_doorman.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-review-migration.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(route, /filterVerifiedMetrics/);
  assert.match(route, /verified_metrics_import_not_configured/);
  assert.match(route, /writePerformed:\s*false/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.match(migrationRoute, /inspectMetricsProvenanceStorage/);
  assert.match(migrationRoute, /authorizationRequired:\s*true/);
  assert.match(migrationRoute, /applyPerformed:\s*false/);
  assert.doesNotMatch(migrationRoute, /\.insert\(|\.update\(|\.delete\(|\.run\(|\.batch\(/);
  assert.match(chainRoute, /inspectMigrationChain/);
  assert.match(chainRoute, /mode:\s*"plan_only"/);
  assert.doesNotMatch(chainRoute, /\.insert\(|\.update\(|\.delete\(|\.run\(|\.batch\(/);
  assert.match(isolatedRoute, /isLocalRequest/);
  assert.match(isolatedRoute, /bridge_capability_unavailable/);
  assert.match(isolatedRoute, /liveDatabaseWrites:\s*false/);
  assert.doesNotMatch(isolatedRoute, /\.insert\(|\.update\(|\.delete\(|\.run\(|\.batch\(/);
  assert.match(chainPlanScript, /buildD1ChainPlan/);
  assert.match(chainApplyScript, /assessD1ChainApplyRequest/);
  assert.doesNotMatch(chainApplyScript, /node:child_process|spawn\(|exec\(|wrangler/);
  assert.match(isolatedVerifyScript, /verifyMigrationChainInMemory/);
  assert.match(isolatedVerifier, /DatabaseSync\(":memory:"\)/);
  assert.match(isolatedVerifier, /ephemeralDatabaseWrites:\s*true/);
  assert.match(isolatedVerifier, /liveDatabaseWrites:\s*false/);
  assert.match(isolatedVerifier, /businessResult:\s*false/);
  assert.match(isolatedVerifier, /ROLLBACK/);
  assert.match(packageJson, /"db:local:chain:plan": "node scripts\/plan-local-d1-chain\.mjs"/);
  assert.match(packageJson, /"db:local:chain:apply": "node scripts\/apply-local-d1-chain\.mjs"/);
  assert.match(packageJson, /"db:chain:verify:isolated": "node scripts\/verify-d1-chain-in-memory\.mjs"/);
  assert.match(page, /来源不明的记录不会展示、训练或参与排序/);
  assert.match(page, /fetch\("\/api\/local\/metrics-migration"/);
  assert.match(page, /D1 METRICS · 只读结构检查/);
  assert.match(page, /fetch\("\/api\/local\/migration-chain"/);
  assert.match(page, /fetch\("\/api\/local\/migration-chain-verification"/);
  assert.match(page, /ISOLATED SQLITE · 结构演练/);
  assert.match(page, /真实 D1 写入/);
  assert.match(page, /D1 CHAIN · 0000 → 0006/);
  assert.match(page, /metricFeedStatus\.status==="verified"\?totalViews/);
  assert.match(styles, /\.metricProvenance/);
  assert.match(styles, /\.metricsMigration/);
  assert.match(styles, /\.migrationChain/);
  assert.match(styles, /\.isolatedChain/);
  assert.match(schema, /sourceKind:\s*text\("source_kind"\)/);
  assert.match(schema, /uniqueIndex\("uq_metrics_platform_post_captured_at"\)/);
  assert.match(migration, /ALTER TABLE `metrics` ADD `source_kind` text/);
  assert.match(migration, /CREATE UNIQUE INDEX `uq_metrics_platform_post_captured_at`/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i);
  assert.match(preflightScript, /metricsProvenance:\s*metricsMigration\.tag/);
  assert.match(preflightScript, /sourcePlanReady:\s*true/);
  assert.match(preflightScript, /readyToApply:\s*false/);
});

test("rolls back a failing migration in isolated memory without touching live D1", async () => {
  const result = await verifyMigrationChainInMemory({
    journalEntries: [{ tag: "0000_valid" }, { tag: "0001_failing" }],
    migrations: [
      { tag: "0000_valid", sql: "CREATE TABLE stable (id INTEGER PRIMARY KEY);" },
      { tag: "0001_failing", sql: "CREATE TABLE transient (id INTEGER PRIMARY KEY); INVALID SQL;" },
    ],
  });
  assert.equal(result.verified, false);
  assert.deepEqual(result.appliedTags, ["0000_valid"]);
  assert.equal(result.failedTag, "0001_failing");
  assert.equal(result.failedStatementIndex, 1);
  assert.equal(result.rollbackPerformed, true);
  assert.equal(result.rollbackVerified, true);
  assert.equal(result.liveDatabaseWrites, false);
  assert.equal(result.liveApplyPerformed, false);
  assert.equal(result.businessResult, false);
});

test("requires every human check without triggering publication", async () => {
  const [jobsRoute, reviewsRoute] = await Promise.all([
    readFile(new URL("../app/api/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/reviews/route.ts", import.meta.url), "utf8"),
  ]);
  const incomplete = validateReviewApproval({
    action: "approve_for_manual_publish",
    jobId: "job-1",
    checks: { facts_verified: true },
  });
  assert.equal(incomplete.ok, false);
  assert.deepEqual(incomplete.missing, REQUIRED_REVIEW_CHECKS.slice(1));

  const checks = Object.fromEntries(REQUIRED_REVIEW_CHECKS.map((check) => [check, true]));
  const complete = validateReviewApproval({ action: "approve_for_manual_publish", jobId: "job-1", checks });
  assert.equal(complete.ok, true);
  assert.equal(complete.jobId, "job-1");
  assert.deepEqual(complete.checks, checks);
  assert.equal(validateReviewApproval({ action: "publish", jobId: "job-1", checks }).ok, false);
  assert.equal(validateReviewableStatus("queued").ok, false);
  assert.deepEqual(validateReviewableStatus("review_pending"), { ok: true, status: "review_pending" });
  assert.match(jobsRoute, /publishTriggered:\s*false/);
  assert.match(jobsRoute, /approved_for_manual_publish/);
  assert.match(jobsRoute, /db\.batch/);
  assert.match(jobsRoute, /reviewAudits/);
  assert.match(jobsRoute, /status:\s*409/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /记录人工审核（不会发布）/);
  assert.match(page, /action:"approve_for_manual_publish"/);
  assert.match(page, /审核历史/);
  assert.match(page, /等待成片进入审核/);
  assert.match(page, /尚未具备人工审核资格/);
  assert.match(reviewsRoute, /jobId is required/);
  assert.match(reviewsRoute, /Review audit storage is not initialized/);
});

test("keeps the Xiaohongshu handoff draft-only and fingerprint bound", async () => {
  const packageFingerprint = "a".repeat(64);
  const assetFingerprint = "c".repeat(64);
  const input = {
    platform: "xiaohongshu",
    accountLabel: "个人科普号",
    content: {
      mode: "video",
      title: "章鱼真的有九个大脑吗",
      caption: "用一分钟看懂章鱼的分布式神经系统。",
      tags: ["动物科普", "冷知识"],
      mediaPaths: ["C:\\work\\octopus.mp4"],
      coverPath: "C:\\work\\octopus-cover.png",
      packageFingerprint,
      assetFingerprint,
    },
    review: { status: "accepted", packageFingerprint },
    assetVerification: { verified: true, assetFingerprint },
    visibleBrowser: true,
  };

  const preview = buildSocialDraftHandoffPlan(input);
  assert.equal(preview.eligible, false);
  assert.deepEqual(preview.blockers, ["explicit_draft_save_approval_missing"]);
  assert.match(preview.handoffFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(preview.draftOnly, true);
  assert.equal(preview.publishAllowed, false);
  assert.equal(preview.publishActionImplemented, false);
  assert.equal(preview.uploadTriggered, false);
  assert.equal(preview.draftSaveTriggered, false);
  assert.equal(preview.publishTriggered, false);

  const staleApproval = buildSocialDraftHandoffPlan({
    ...input,
    userApprovedDraftSave: true,
    approvedHandoffFingerprint: "b".repeat(64),
  });
  assert.deepEqual(staleApproval.blockers, ["handoff_fingerprint_mismatch"]);

  const approved = buildSocialDraftHandoffPlan({
    ...input,
    userApprovedDraftSave: true,
    approvedHandoffFingerprint: preview.handoffFingerprint,
  });
  assert.equal(approved.eligible, true);
  assert.equal(approved.status, "approved_for_single_draft_handoff");
  assert.equal(approved.approvalScope, "single_xiaohongshu_draft_save");
  assert.equal(approved.publishTriggered, false);
});

test("hashes only real draft assets inside work packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "zhihui-draft-assets-"));
  const packageRoot = join(root, "work", "packages", "pilot");
  const mediaPath = join(packageRoot, "video.mp4");
  const coverPath = join(packageRoot, "cover.png");
  const outsidePath = join(root, "outside.mp4");
  try {
    await mkdir(packageRoot, { recursive:true });
    await writeFile(mediaPath, "real-video-bytes");
    await writeFile(coverPath, "real-cover-bytes");
    await writeFile(outsidePath, "outside");

    const verified = await inspectSocialDraftAssets({ projectRoot:root, mediaPaths:[mediaPath], coverPath });
    assert.equal(verified.verified, true);
    assert.equal(verified.assets.length, 2);
    assert.match(verified.assetFingerprint, /^[a-f0-9]{64}$/);
    assert.ok(verified.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256)));
    assert.ok(verified.assets.every((asset) => !asset.path.includes(root)));
    assert.equal(verified.fileContentsReturned, false);
    assert.equal(verified.uploadTriggered, false);

    const escaped = await inspectSocialDraftAssets({ projectRoot:root, mediaPaths:[outsidePath] });
    assert.equal(escaped.verified, false);
    assert.deepEqual(escaped.blockers, ["asset_0_outside_package_root"]);
    assert.equal(escaped.assetFingerprint, null);
  } finally {
    await rm(root, { recursive:true, force:true });
  }
});

test("derives a draft candidate from the verified Xiaohongshu delivery package without uploading", () => {
  const platformCopy = { title:"章鱼真的有九个大脑吗", caption:"一分钟看懂章鱼神经系统。", hashtags:["动物科普"], ai_disclosure:"本视频含 AI 辅助生成画面与配音" };
  const readiness = {
    eligible:true,
    mediaStatus:"ready_for_review",
    artifactChecks:[{ kind:"video", file:"final.mp4", verified:true, eligibleForProduction:true }],
    platformPackageEvidence:{ perPlatform:[{ platform:"xiaohongshu", ready:true }], files:[{ platform:"xiaohongshu", verified:true }] },
  };
  const ready = buildXiaohongshuDraftPackagePlan({ project:"pilot", readiness, platformCopy, manifestText:"manifest", platformCopyText:JSON.stringify(platformCopy) });
  assert.equal(ready.readyForHumanDraftReview, true);
  assert.deepEqual(ready.content.mediaPaths, ["work/packages/pilot/final.mp4"]);
  assert.match(ready.packageFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(ready.humanReviewStillRequired, true);
  assert.equal(ready.uploadTriggered, false);
  assert.equal(ready.publishTriggered, false);

  const current = buildXiaohongshuDraftPackagePlan({ project:"octopus-pilot", readiness:{ ...readiness, eligible:false, mediaStatus:"waiting_for_generation", artifactChecks:readiness.artifactChecks.slice(1) }, platformCopy, manifestText:"manifest", platformCopyText:JSON.stringify(platformCopy) });
  assert.deepEqual(current.blockers, ["rendered_media_not_ready", "production_video_missing", "delivery_package_not_review_ready"]);
  assert.equal(current.readyForHumanDraftReview, false);
});

test("prepares only a visible-browser Xiaohongshu draft execution contract", () => {
  const handoffPlan = { eligible:true, draftOnly:true, publishAllowed:false, handoffFingerprint:"a".repeat(64) };
  const blocked = planXiaohongshuDraftExecution({ handoffPlan });
  assert.deepEqual(blocked.blockers, ["interactive_login_not_verified", "account_label_not_verified", "draft_execution_not_requested"]);
  assert.equal(blocked.browserAdapterCalled, false);
  assert.equal(blocked.uploadTriggered, false);
  assert.equal(blocked.publishTriggered, false);

  const ready = planXiaohongshuDraftExecution({
    handoffPlan,
    loginEvidence:{ source:"visible_browser_inspection", creatorCenterAuthenticated:true, accountLabel:"个人科普号" },
    executionRequested:true,
  });
  assert.equal(ready.readyForBrowserAdapter, true);
  assert.equal(ready.state, "ready_for_visible_browser_adapter");
  assert.ok(ready.allowedBrowserSteps.includes("save_to_drafts"));
  assert.ok(ready.allowedBrowserSteps.includes("verify_draft_receipt"));
  assert.ok(ready.forbiddenBrowserSteps.includes("click_publish"));
  assert.ok(ready.forbiddenBrowserSteps.includes("export_cookie"));
  assert.equal(ready.browserAdapterImplemented, false);
  assert.equal(ready.publishAllowed, false);
  assert.equal(ready.publishActionImplemented, false);
});

test("diagnoses a stale studio build without restarting its process", async () => {
  const [route, server, script, packageJson] = await Promise.all([
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-studio-build.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(route, /draftHandoffProtocolVersion: SOCIAL_DRAFT_PROTOCOL_VERSION/);
  assert.match(route, /const BRIDGE_URL = "http:\/\/127\.0\.0\.1:3765"/);
  assert.match(route, /social-draft-package\?project=/);
  assert.match(route, /function localPackageErrorCode\(error: unknown\)/);
  assert.match(route, /errorCode:localPackageErrorCode\(error\)/);
  assert.doesNotMatch(route, /packageRootFound/);
  assert.match(server, /requestUrl\.pathname === "\/social-draft-package"/);
  assert.match(script, /draft_protocol_version_mismatch/);
  assert.match(script, /draft_package_plan_missing/);
  assert.match(script, /deliveryReady/);
  assert.match(script, /deliveryBlockers/);
  assert.match(script, /restartAttempted:false/);
  assert.match(script, /processMutation:false/);
  assert.doesNotMatch(script, /Stop-Process|taskkill|process\.kill|spawn\(|exec\(/);
  assert.match(packageJson, /"studio:build:check": "node scripts\/check-studio-build\.mjs"/);
});

test("launches the local studio through the supported loopback dev runtime", async () => {
  const [launcher, packageJson] = await Promise.all([
    readFile(new URL("../start-local-studio.ps1", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(packageJson, /"local:serve": "vinext dev --hostname 127\.0\.0\.1 --port 3000"/);
  assert.match(launcher, /-ArgumentList "run", "local:serve"/);
  assert.match(launcher, /\$env:ZHIHUI_PROJECT_ROOT = \$ProjectRoot/);
  assert.doesNotMatch(launcher, /-ArgumentList "run", "start"/);
  assert.match(launcher, /-WindowStyle Hidden/);
  assert.match(launcher, /function Get-StudioBuildStatus/);
  assert.match(launcher, /draftHandoffProtocolVersion/);
  assert.match(launcher, /packagePlan/);
  assert.match(launcher, /The studio build is stale/);
  assert.doesNotMatch(launcher, /Stop-Process|taskkill/);
});

test("shows the Xiaohongshu draft-only boundary in the local console", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /fetch\("\/api\/local\/social-draft-handoff\?project=octopus-pilot"/);
  assert.match(page, /XIAOHONGSHU DRAFT · 本机安全门/);
  assert.match(page, /不收密码 \/ Cookie/);
  assert.match(page, /永久未实现/);
  assert.match(page, /发布 \{socialDraftHandoff\.publishTriggered\?/);
  assert.match(styles, /\.socialDraftHandoff/);
});

test("rejects hidden, unreviewed, non-Xiaohongshu or secret-bearing draft handoffs", async () => {
  const blocked = buildSocialDraftHandoffPlan({
    platform: "douyin",
    accountLabel: "",
    content: { mode: "video", title: "", caption: "", mediaPaths: [], packageFingerprint: "bad" },
    review: { status: "draft", packageFingerprint: "b".repeat(64) },
    visibleBrowser: false,
  });
  assert.deepEqual(blocked.blockers, [
    "platform_not_supported_for_draft_pilot",
    "account_label_missing",
    "title_missing_or_too_long",
    "caption_missing_or_too_long",
    "media_missing",
    "package_fingerprint_missing",
    "asset_verification_missing",
    "human_review_not_accepted",
    "visible_browser_required",
  ]);
  assert.equal(blocked.handoffFingerprint, null);
  assert.equal(blocked.cookieExportAllowed, false);
  assert.equal(blocked.verificationBypassAllowed, false);

  const route = await readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8");
  assert.match(route, /body\.action !== "preview" && body\.action !== "preview_execution"/);
  assert.match(route, /planXiaohongshuDraftExecution/);
  assert.match(route, /containsSecretField/);
  assert.match(route, /publishAllowed:\s*false/);
  assert.match(route, /publishActionImplemented:\s*false/);
  assert.match(route, /draftSaveTriggered:\s*false/);
  assert.match(route, /publishTriggered:\s*false/);
  assert.doesNotMatch(route, /action\s*===\s*["']publish["']/);
});

test("documents a reproducible collaborator bootstrap without secrets", async () => {
  const [readme, bootstrap, migrationPreflight] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../scripts/bootstrap-vendors.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-review-migration.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(readme, /知绘工厂/);
  assert.match(readme, /npm run vendors:bootstrap/);
  assert.match(readme, /不要在 issue、PR、聊天或配置样例中粘贴 API Key/);
  assert.match(bootstrap, /xuanyustudio\/LocalMiniDrama\.git/);
  assert.match(bootstrap, /--recurse-submodules/);
  assert.doesNotMatch(bootstrap, /api[_-]?key\s*=\s*["'][^"']+["']/i);
  assert.match(readme, /npm run db:preflight/);
  assert.match(migrationPreflight, /destructiveStatements:\s*false/);
  assert.match(migrationPreflight, /assert\.doesNotMatch/);
});
