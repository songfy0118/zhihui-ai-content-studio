import { createHash } from "node:crypto";

import { NEWS_SOURCE_CATALOG } from "./news-source-catalog.mjs";

const HASH = /^[a-f0-9]{64}$/;
const BODY_ELIGIBLE_POLICIES = new Set([
  "link_and_summarize_with_attribution",
  "official_public_record_with_attribution",
]);

export const PUBLIC_ARTICLE_ACQUISITION_LIMITS = Object.freeze({
  maxDocuments: 2,
  concurrency: 1,
  timeoutMs: 8_000,
  maxBytesPerDocument: 2_000_000,
  maxRedirects: 3,
  minimumIntervalMs: 2_000,
});

const STOP_CONDITIONS = Object.freeze([
  "robots_disallowed",
  "login_required",
  "paywall_detected",
  "captcha_detected",
  "rate_limited",
  "redirect_outside_configured_source_host",
  "non_html_content",
  "document_too_large",
]);

function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function parseHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname ? url : null;
  } catch {
    return null;
  }
}

function withinConfiguredHost(articleUrl, baseUrl) {
  const article = parseHttpsUrl(articleUrl);
  const base = parseHttpsUrl(baseUrl);
  if (!article || !base) return false;
  return article.hostname === base.hostname || article.hostname.endsWith(`.${base.hostname}`);
}

function planTarget(evidence, source) {
  const blockers = [];
  if (!source) blockers.push("source_not_cataloged");
  if (source && source.enabled !== true) blockers.push("source_disabled");
  if (source?.requiresLogin === true) blockers.push("source_requires_login");
  if (source && !["rss", "official_newsroom"].includes(source.sourceType)) blockers.push("source_type_not_public_automatic");
  if (source && !BODY_ELIGIBLE_POLICIES.has(source.rightsPolicy)) blockers.push("source_body_policy_review_required");
  if (source && !withinConfiguredHost(evidence?.canonicalUrl, source.baseUrl)) blockers.push("source_url_host_mismatch");
  if (!text(evidence?.evidenceId) || !text(evidence?.sourceId) || !text(evidence?.evidenceRole)) blockers.push("evidence_identity_invalid");

  const eligible = blockers.length === 0;
  return {
    evidenceId: text(evidence?.evidenceId),
    sourceId: text(evidence?.sourceId),
    sourceName: text(source?.name),
    evidenceRole: text(evidence?.evidenceRole),
    canonicalUrl: parseHttpsUrl(evidence?.canonicalUrl)?.toString() ?? null,
    rightsPolicy: text(source?.rightsPolicy),
    eligible,
    blockers,
    request: eligible ? {
      method: "GET",
      accept: "text/html,application/xhtml+xml",
      credentials: "omit",
      redirectPolicy: "configured_source_host_only",
      limits: PUBLIC_ARTICLE_ACQUISITION_LIMITS,
    } : null,
  };
}

export function buildPublicArticleAcquisitionPlan(briefPreview, sources = NEWS_SOURCE_CATALOG) {
  const blockers = [];
  if (briefPreview?.status !== "text_draft_brief_preview_ready" || briefPreview?.readyForHumanResearch !== true || !briefPreview?.brief) blockers.push("text_draft_brief_not_ready");
  if (!HASH.test(briefPreview?.briefFingerprint ?? "")) blockers.push("text_draft_brief_fingerprint_invalid");

  const catalogById = new Map((Array.isArray(sources) ? sources : []).map((source) => [source.id, source]));
  const evidence = Array.isArray(briefPreview?.brief?.evidence) ? briefPreview.brief.evidence : [];
  if (evidence.length !== PUBLIC_ARTICLE_ACQUISITION_LIMITS.maxDocuments) blockers.push("article_target_count_invalid");
  const targets = evidence.map((item) => planTarget(item, catalogById.get(item.sourceId)));
  targets.forEach((target) => target.blockers.forEach((blocker) => blockers.push(`${target.sourceId ?? "unknown"}:${blocker}`)));

  const ready = blockers.length === 0;
  const planPayload = ready ? {
    briefFingerprint: briefPreview.briefFingerprint,
    targets,
    stopConditions: STOP_CONDITIONS,
    extraction: {
      mainTextOnly: true,
      rawHtmlPersistence: false,
      articleTextPersistence: false,
      imagesAllowed: false,
      commentsAllowed: false,
      use: "fact_research_and_original_summary_with_attribution",
    },
  } : null;

  return {
    status: ready ? "public_article_acquisition_plan_ready" : "public_article_acquisition_plan_blocked",
    readyForExecutionAuthorizationRequest: ready,
    blockers,
    planFingerprint: planPayload ? createHash("sha256").update(JSON.stringify(planPayload)).digest("hex") : null,
    briefFingerprint: HASH.test(briefPreview?.briefFingerprint ?? "") ? briefPreview.briefFingerprint : null,
    targets,
    limits: PUBLIC_ARTICLE_ACQUISITION_LIMITS,
    stopConditions: STOP_CONDITIONS,
    extraction: planPayload?.extraction ?? null,
    automaticExecutionAllowed: false,
    executionAuthorized: false,
    networkRequestsPlanned: ready ? targets.length : 0,
    networkRequestsMade: 0,
    sourceBodiesFetched: false,
    rawContentPersisted: false,
    factsVerified: false,
    readyForCopyGeneration: false,
    modelCalls: 0,
    databaseWrites: false,
    externalCalls: 0,
    draftGenerated: false,
    publishTriggered: false,
    businessResult: false,
  };
}
