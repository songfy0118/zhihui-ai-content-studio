import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";
import { buildManualPublicEvidencePreview } from "../bridge/manual-public-evidence-preview.mjs";
import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";
import { formatManualEvidenceBlocker, formatManualEvidencePublisherRole } from "../app/manual-evidence-diagnostics.ts";
import { buildManualEvidenceFormReadiness, describeManualEvidencePreviewReadiness } from "../app/manual-evidence-form-readiness.ts";

const lead = {
  id: "cluster:one",
  title: "OpenAI launches enterprise agent platform",
  sourceId: "source-a",
  publishedAt: "2026-08-20T12:00:00.000Z",
  missingIndependentSources: 1,
  suggestedQueries: ["OpenAI enterprise agent platform"],
  evidence: [{ id: "a-one", sourceId: "source-a", sourceName: "Original", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://origin.news/story", publishedAt: "2026-08-20T12:00:00.000Z" }],
};
const sources = [
  { id: "source-a", name: "Original", sourceType: "rss", baseUrl: "https://origin.news/", feedUrl: "https://origin.news/feed", enabled: true, requiresLogin: false },
  { id: "source-b", name: "Catalog source", editorialAliases: ["Catalog alias"], sourceType: "rss", baseUrl: "https://catalog.news/", feedUrl: "https://feeds.catalog.news/feed", feedEvidenceUrl: "https://evidence.catalog.news/", enabled: true, requiresLogin: false },
];

test("formats manual evidence blockers as actionable Chinese diagnostics", () => {
  assert.equal(formatManualEvidenceBlocker("invalid_manual_evidence_request"), "请完整填写待补证标题、来源名称、发布者身份、候选标题、公开链接和发布时间");
  assert.equal(formatManualEvidenceBlocker("manual_candidate_invalid:0:public_https_url_required"), "第 1 条：请填写无需登录的公开 HTTPS 链接");
  assert.equal(formatManualEvidenceBlocker("manual_candidate_invalid:0:publisher_role_invalid"), "第 1 条：请选择原始发布者或转载页");
  assert.equal(formatManualEvidenceBlocker("manual_candidate_invalid:0:registered_source_host_mismatch"), "第 1 条：已登记来源名称与公开链接主机不一致；请核对来源或改用实际来源名称");
  assert.equal(formatManualEvidenceBlocker("manual_candidate_invalid:2:same_exact_host"), "第 3 条：候选链接与原来源属于同一主机");
  assert.equal(formatManualEvidenceBlocker("manual_candidate_invalid:0:future_reason"), "第 1 条：future_reason");
  assert.equal(formatManualEvidenceBlocker("future_blocker"), "future_blocker");
});

test("formats declared publisher roles for the human review card", () => {
  assert.equal(formatManualEvidencePublisherRole("original_publisher"), "原始发布者");
  assert.equal(formatManualEvidencePublisherRole("syndicated_or_repost"), "转载页 / 聚合页（需继续核对转载链）");
  assert.equal(formatManualEvidencePublisherRole(null), "发布者身份未声明");
});

test("reports manual evidence field completion without validating or fetching the link", () => {
  const partial = buildManualEvidenceFormReadiness({ leadId:lead.id, sourceName:"量子位 · QbitAI", publisherRole:"", title:"", canonicalUrl:"", publishedAt:"" });
  assert.equal(partial.completed, 2);
  assert.equal(partial.total, 6);
  assert.equal(partial.ready, false);
  assert.deepEqual(partial.missingLabels, ["发布者身份", "候选标题", "公开 HTTPS 链接", "发布时间"]);
  const complete = buildManualEvidenceFormReadiness({ leadId:lead.id, sourceName:"Independent", publisherRole:"original_publisher", title:"Report", canonicalUrl:"not-yet-validated", publishedAt:"not-yet-validated" });
  assert.equal(complete.ready, true);
});

test("keeps the progress copy aligned with the local link gate", () => {
  assert.equal(describeManualEvidencePreviewReadiness(false, false), "缺少字段时不会发送预览请求");
  assert.equal(describeManualEvidencePreviewReadiness(true, true), "字段已填齐，但本地链接校验已阻断；修正红色提示后才能预览");
  assert.match(describeManualEvidencePreviewReadiness(true, false), /字段已填齐且本地链接校验通过/);
});

test("wires manual source name suggestions without automatic article collection", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /listManualSourceNameSuggestions\(newsSourceCatalog\.sources\)/);
  assert.match(page, /listEvidenceHandoffSourceSuggestions\(newsSourceCatalog\.sources\)/);
  assert.match(page, /list="manualEvidenceSourceOptions"/);
  assert.match(page, /manualSourceNameSuggestions\.map/);
  assert.match(page, /仅提供已登记的名称建议；不会自动抓取公众号/);
  assert.match(page, /assessManualSourceLinkHost\(manualEvidenceDraft\.sourceName, manualEvidenceDraft\.canonicalUrl, manualHandoffSourceSuggestions\)/);
  assert.match(page, /manualSourceLinkHostAssessment\.blocksPreview\?"sourceHostHint error":"sourceHostHint"/);
  assert.match(page, /role=\{manualSourceLinkHostAssessment\.blocksPreview\?"alert":undefined\}/);
  assert.match(page, /target\.originalEvidence&&<a href=\{target\.originalEvidence\.canonicalUrl\} target="_blank" rel="noreferrer">人工打开原始来源<\/a>/);
  assert.match(page, /<a href=\{candidate\.canonicalUrl\} target="_blank" rel="noreferrer">人工打开候选来源<\/a>/);
  assert.match(page, /decision\.candidateMode==="manual_public_metadata"&&<span>发布者身份：/);
  assert.match(page, /formatManualEvidencePublisherRole\(manualEvidencePreview\?\.targets\?/);
  assert.match(page, /function ManualEvidenceReviewLinks/);
  assert.match(page, /人工公开元数据 · \{candidate\.sourceName\} · \{target\.originalHost\?\?"原域名未知"\} → \{candidate\.candidateHost\}/);
  assert.match(page, /审查时打开原始来源/);
  assert.match(page, /审查时打开候选来源/);
  assert.match(page, /<ManualEvidenceReviewLinks preview=\{manualEvidencePreview\} leadId=\{leadId\} candidateId=\{decision\.candidateId\}\/>/);
});

test("hands empty RSS candidates to an explicit no-write manual evidence form", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /evidenceMetadataPreview\?\.status==="no_metadata_candidates"&&evidenceGapShortlist\.length===1&&evidenceSearchPlan\?\.readyForHumanResearchReview/);
  assert.match(page, /RSS 暂无合格第二来源，转人工公开页补证/);
  assert.match(page, /setManualEvidenceDraft\(\(current\) => syncManualEvidenceDraftToShortlist\(current, nextShortlist\)\)/);
  assert.match(page, /onClick=\{\(\)=>updateManualEvidenceDraft\("sourceName",source\.name\)\}>使用/);
  assert.match(page, /已预选当前唯一线索/);
  assert.match(page, /不会自动打开、抓取或保存 · 正文读取 0 · 事实核验 0 · 来源锁 0/);
  assert.match(page, /人工补证必填进度 \{manualEvidenceFormReadiness\.completed\}\/\{manualEvidenceFormReadiness\.total\}/);
  assert.match(page, /describeManualEvidencePreviewReadiness\(manualEvidenceFormReadiness\.ready,manualSourceLinkHostAssessment\.blocksPreview\)/);
  assert.match(page, /if \(!manualEvidenceFormReadiness\.ready \|\| evidenceGapShortlist\.length !== 1\)/);
  assert.match(page, /if \(manualSourceLinkHostAssessment\.blocksPreview\)[\s\S]*?未发送预览请求/);
  assert.match(page, /disabled=\{manualEvidenceBusy\|\|manualSourceLinkHostAssessment\.blocksPreview\|\|/);
});

const plan = buildEvidenceSearchPlan([lead], [lead.id], sources);

function input(overrides = {}) {
  return {
    leadId: lead.id,
    sourceName: "Independent News",
    publisherRole: "original_publisher",
    title: "Enterprise agent platform launched by OpenAI",
    canonicalUrl: "https://independent.news/report",
    publishedAt: "2026-08-20T14:00:00.000Z",
    ...overrides,
  };
}

test("previews one public manual candidate without fetching or persisting it", () => {
  const preview = buildManualPublicEvidencePreview(plan, [input()]);
  assert.equal(preview.status, "manual_evidence_preview_ready");
  assert.equal(preview.summary.candidatesAccepted, 1);
  assert.equal(preview.targets[0].originalHost, "origin.news");
  assert.equal(preview.targets[0].originalEvidence.canonicalUrl, "https://origin.news/story");
  assert.equal(preview.targets[0].candidates[0].candidateHost, "independent.news");
  assert.equal(preview.targets[0].candidates[0].publishedDeltaHours, 2);
  assert.equal(preview.targets[0].candidates[0].inputMode, "user_supplied_public_metadata");
  assert.equal(preview.targets[0].candidates[0].publisherRole, "original_publisher");
  assert.equal(preview.candidateUrlFetched, false);
  assert.equal(preview.articleBodiesFetched, false);
  assert.equal(preview.manualInputPersisted, false);
  assert.equal(preview.factsVerified, false);
  assert.equal(preview.sourceLocksCreated, 0);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.publishTriggered, false);
});

test("blocks unsafe, same-host, stale and unrelated manual candidates", () => {
  const cases = [
    [input({ canonicalUrl: "http://independent.news/report" }), "public_https_url_required"],
    [input({ canonicalUrl: "https://user:secret@independent.news/report" }), "public_https_url_required"],
    [input({ canonicalUrl: "https://127.0.0.1/report" }), "public_https_url_required"],
    [input({ canonicalUrl: "https://origin.news/other" }), "same_exact_host"],
    [input({ publisherRole: "" }), "publisher_role_invalid"],
    [input({ publishedAt: "2026-09-20T14:00:00.000Z" }), "outside_time_window"],
    [input({ title: "Local sports schedule update" }), "title_match_below_threshold"],
  ];
  for (const [candidate, blocker] of cases) {
    const preview = buildManualPublicEvidencePreview(plan, [candidate]);
    assert.equal(preview.status, "manual_evidence_preview_blocked");
    assert.ok(preview.blockers.some((value) => value.endsWith(blocker)), blocker);
  }
});

test("binds registered source names and aliases to catalog hosts while allowing custom sources", () => {
  for (const candidate of [
    input({ sourceName: "Catalog source", canonicalUrl: "https://catalog.news/report" }),
    input({ sourceName: "Catalog alias", canonicalUrl: "https://evidence.catalog.news/report" }),
    input({ sourceName: "Catalog source", canonicalUrl: "https://feeds.catalog.news/report" }),
    input({ sourceName: "Independent News", canonicalUrl: "https://independent.news/report" }),
  ]) {
    const preview = buildManualPublicEvidencePreview(plan, [candidate], { registeredSources: sources });
    assert.equal(preview.status, "manual_evidence_preview_ready");
    assert.equal(preview.validationPolicy.registeredSourceHostBound, true);
  }

  const mismatch = buildManualPublicEvidencePreview(plan, [input({
    sourceName: "Catalog alias",
    canonicalUrl: "https://independent.news/report",
  })], { registeredSources: sources });
  assert.equal(mismatch.status, "manual_evidence_preview_blocked");
  assert.ok(mismatch.blockers.includes("manual_candidate_invalid:0:registered_source_host_mismatch"));
});

test("binds QbitAI and Silicon Star Pro handoff names to their registered public hosts", () => {
  for (const candidate of [
    input({ sourceName: "量子位", canonicalUrl: "https://www.qbitai.com/2026/08/report" }),
    input({ sourceName: "硅星人Pro", canonicalUrl: "https://mp.weixin.qq.com/s/public-article" }),
  ]) {
    const preview = buildManualPublicEvidencePreview(plan, [candidate], { registeredSources: NEWS_SOURCE_CATALOG });
    assert.equal(preview.status, "manual_evidence_preview_ready");
  }

  const mismatch = buildManualPublicEvidencePreview(plan, [input({
    sourceName: "量子位 · QbitAI",
    canonicalUrl: "https://mp.weixin.qq.com/s/not-qbitai",
  })], { registeredSources: NEWS_SOURCE_CATALOG });
  assert.ok(mismatch.blockers.includes("manual_candidate_invalid:0:registered_source_host_mismatch"));
});

test("blocks missing plans, empty input and duplicate lead candidates", () => {
  assert.ok(buildManualPublicEvidencePreview(null, [input()]).blockers.includes("search_plan_not_ready"));
  assert.ok(buildManualPublicEvidencePreview(plan, []).blockers.includes("manual_evidence_input_empty"));
  const duplicate = buildManualPublicEvidencePreview(plan, [input(), input({ canonicalUrl: "https://second.news/report" })]);
  assert.ok(duplicate.blockers.some((value) => value.endsWith("duplicate_lead")));
});

test("builds a no-write source-lock save plan after manual evidence review", () => {
  const metadata = buildManualPublicEvidencePreview(plan, [input()]);
  const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));
  const preview = buildEvidenceReviewPreview(plan, metadata, [{ leadId: lead.id, candidateId: metadata.targets[0].candidates[0].id, checks }]);
  assert.equal(preview.humanEvidenceReviewComplete, true);
  assert.equal(preview.readyForAuthorizedSourceLockSave, true);
  assert.deepEqual(preview.downstreamBlockers, []);
  assert.match(preview.reviewFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(preview.reviewedTargets[0].independenceAssessment.candidatePublisherRole, "original_publisher");
  const savePlan = buildSourceLockSavePlan(preview, { confirmedReviewFingerprint: preview.reviewFingerprint });
  assert.equal(savePlan.status, "source_lock_save_plan_ready");
  assert.equal(savePlan.plannedRecordCount, 1);
  assert.equal(savePlan.plannedLocks[0].sources[1].publisherRole, "original_publisher");
  assert.equal(savePlan.authorizationGranted, false);
  assert.equal(savePlan.writeAllowed, false);
  assert.equal(savePlan.persisted, false);
  assert.equal(savePlan.sourceLocksCreated, 0);
  assert.equal(savePlan.databaseWrites, false);
});

test("binds the declared publisher role into the human review fingerprint", () => {
  const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));
  const original = buildManualPublicEvidencePreview(plan, [input({ publisherRole: "original_publisher" })]);
  const repost = buildManualPublicEvidencePreview(plan, [input({ publisherRole: "syndicated_or_repost" })]);
  const originalReview = buildEvidenceReviewPreview(plan, original, [{ leadId: lead.id, candidateId: original.targets[0].candidates[0].id, checks }]);
  const repostReview = buildEvidenceReviewPreview(plan, repost, [{ leadId: lead.id, candidateId: repost.targets[0].candidates[0].id, checks }]);
  assert.notEqual(originalReview.reviewFingerprint, repostReview.reviewFingerprint);
  assert.equal(repostReview.reviewedTargets[0].independenceAssessment.candidatePublisherRole, "syndicated_or_repost");
});
