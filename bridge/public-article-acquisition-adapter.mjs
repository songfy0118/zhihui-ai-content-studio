import { createHash } from "node:crypto";

import { fingerprintPublicArticleAcquisitionPlan } from "./public-article-acquisition-plan.mjs";

const HASH = /^[a-f0-9]{64}$/;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MINIMUM_TEXT_CHARS = 120;
const MAXIMUM_EXTRACTED_CHARS = 30_000;

export const PUBLIC_ARTICLE_FETCH_CONFIRMATION = "FETCH_PLANNED_PUBLIC_ARTICLES";

function safeResult(fields = {}) {
  return {
    status: "public_article_acquisition_blocked",
    blockers: [],
    documents: [],
    diagnostics: [],
    networkRequestsMade: 0,
    robotsChecksMade: 0,
    sourceBodiesFetched: false,
    rawContentPersisted: false,
    articleTextPersisted: false,
    factsVerified: false,
    readyForCopyGeneration: false,
    modelCalls: 0,
    databaseWrites: false,
    draftGenerated: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function decodeHtml(value = "") {
  const decodeCodePoint = (raw, radix) => {
    const codePoint = Number.parseInt(raw, radix);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : "�";
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(code, 10))
    .replace(/&#x([\da-f]+);/gi, (_, code) => decodeCodePoint(code, 16))
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function extractPublicArticleText(html) {
  if (typeof html !== "string") return { title: null, text: "" };
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const mainMatch = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const selected = mainMatch?.[1] ?? bodyMatch?.[1] ?? html;
  const text = decodeHtml(selected
    .replace(/<(?:script|style|nav|footer|form|aside|noscript|svg)\b[\s\S]*?<\/(?:script|style|nav|footer|form|aside|noscript|svg)>/gi, " ")
    .replace(/<br\s*\/?>|<\/(?:p|div|section|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAXIMUM_EXTRACTED_CHARS);
  const title = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 500) : null;
  return { title: title || null, text };
}

function withinHost(urlValue, configuredHost) {
  try {
    const url = new URL(urlValue);
    return url.protocol === "https:" && (url.hostname === configuredHost || url.hostname.endsWith(`.${configuredHost}`));
  } catch {
    return false;
  }
}

function barrierCode(status, html = "") {
  if (status === 401 || status === 403) return "login_or_access_denied";
  if (status === 402) return "paywall_detected";
  if (status === 429) return "rate_limited";
  if (status >= 400) return `http_${status}`;
  const normalized = html.toLowerCase();
  if (/recaptcha|hcaptcha|captcha|verify you are human/.test(normalized)) return "captcha_detected";
  if (/subscribe to continue|subscription required|class=["'][^"']*paywall|id=["'][^"']*paywall/.test(normalized)) return "paywall_detected";
  if (/type=["']password|sign in to continue|log in to continue/.test(normalized)) return "login_required";
  return null;
}

function assessGate({ plan, executeRequested, confirmation, authorizedPlanFingerprint, fetcher, robotsPolicyChecker }) {
  const blockers = [];
  if (plan?.status !== "public_article_acquisition_plan_ready" || plan?.readyForExecutionAuthorizationRequest !== true) blockers.push("article_acquisition_plan_not_ready");
  if (!HASH.test(plan?.planFingerprint ?? "")) blockers.push("article_acquisition_plan_fingerprint_invalid");
  const recomputed = plan?.targets && plan?.stopConditions && plan?.extraction
    ? fingerprintPublicArticleAcquisitionPlan(plan)
    : null;
  if (recomputed !== plan?.planFingerprint) blockers.push("article_acquisition_plan_tampered");
  if (executeRequested !== true) blockers.push("article_fetch_execution_not_requested");
  if (confirmation !== PUBLIC_ARTICLE_FETCH_CONFIRMATION) blockers.push("article_fetch_confirmation_invalid");
  if (authorizedPlanFingerprint !== plan?.planFingerprint) blockers.push("article_fetch_fingerprint_mismatch");
  if (typeof fetcher !== "function") blockers.push("article_fetcher_required");
  if (typeof robotsPolicyChecker !== "function") blockers.push("robots_policy_checker_required");
  if (!Array.isArray(plan?.targets) || plan.targets.length !== plan?.limits?.maxDocuments || plan.targets.some((target) => target?.eligible !== true || target?.request?.method !== "GET" || !withinHost(target.canonicalUrl, target.configuredHost))) blockers.push("article_fetch_targets_invalid");
  return blockers;
}

async function fetchOne(target, plan, { fetcher, robotsPolicyChecker }) {
  let robots;
  try {
    robots = await robotsPolicyChecker({ url: target.canonicalUrl, sourceId: target.sourceId, configuredHost: target.configuredHost });
  } catch {
    return { ok: false, blocker: "robots_check_failed", networkRequestsMade: 0, robotsChecksMade: 1 };
  }
  if (robots?.checked !== true || robots?.allowed !== true) return { ok: false, blocker: robots?.checked === true ? "robots_disallowed" : "robots_check_incomplete", networkRequestsMade: 0, robotsChecksMade: 1 };

  let currentUrl = target.canonicalUrl;
  let networkRequestsMade = 0;
  for (let redirectCount = 0; redirectCount <= plan.limits.maxRedirects; redirectCount += 1) {
    let response;
    try {
      response = await fetcher(currentUrl, {
        method: "GET",
        headers: { Accept: target.request.accept },
        credentials: "omit",
        redirect: "manual",
        signal: AbortSignal.timeout(plan.limits.timeoutMs),
      });
      networkRequestsMade += 1;
    } catch (error) {
      const blocker = error?.name === "TimeoutError" ? "timeout" : "network_fetch_failed";
      return { ok: false, blocker, networkRequestsMade, robotsChecksMade: 1 };
    }
    if (!response || typeof response.status !== "number" || typeof response.headers?.get !== "function" || typeof response.text !== "function") return { ok: false, blocker: "fetch_response_invalid", networkRequestsMade, robotsChecksMade: 1 };

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, blocker: "redirect_location_missing", networkRequestsMade, robotsChecksMade: 1 };
      if (redirectCount >= plan.limits.maxRedirects) return { ok: false, blocker: "redirect_limit_exceeded", networkRequestsMade, robotsChecksMade: 1 };
      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        return { ok: false, blocker: "redirect_location_invalid", networkRequestsMade, robotsChecksMade: 1 };
      }
      if (!withinHost(nextUrl, target.configuredHost)) return { ok: false, blocker: "redirect_outside_configured_source_host", networkRequestsMade, robotsChecksMade: 1 };
      currentUrl = nextUrl;
      continue;
    }

    const statusBlocker = barrierCode(response.status);
    if (statusBlocker) return { ok: false, blocker: statusBlocker, networkRequestsMade, robotsChecksMade: 1 };
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return { ok: false, blocker: "non_html_content", networkRequestsMade, robotsChecksMade: 1 };
    const reportedBytes = Number(response.headers.get("content-length") ?? 0);
    if (reportedBytes > plan.limits.maxBytesPerDocument) return { ok: false, blocker: "document_too_large", networkRequestsMade, robotsChecksMade: 1 };

    let html;
    try {
      html = await response.text();
    } catch {
      return { ok: false, blocker: "response_body_read_failed", networkRequestsMade, robotsChecksMade: 1 };
    }
    if (new TextEncoder().encode(html).byteLength > plan.limits.maxBytesPerDocument) return { ok: false, blocker: "document_too_large", networkRequestsMade, robotsChecksMade: 1 };
    const contentBlocker = barrierCode(response.status, html);
    if (contentBlocker) return { ok: false, blocker: contentBlocker, networkRequestsMade, robotsChecksMade: 1 };
    const extracted = extractPublicArticleText(html);
    if (extracted.text.length < MINIMUM_TEXT_CHARS) return { ok: false, blocker: "article_text_too_short", networkRequestsMade, robotsChecksMade: 1 };
    return {
      ok: true,
      networkRequestsMade,
      robotsChecksMade: 1,
      document: {
        evidenceId: target.evidenceId,
        sourceId: target.sourceId,
        evidenceRole: target.evidenceRole,
        canonicalUrl: target.canonicalUrl,
        finalUrl: currentUrl,
        title: extracted.title,
        text: extracted.text,
        textHash: createHash("sha256").update(extracted.text).digest("hex"),
        ephemeral: true,
      },
    };
  }
  return { ok: false, blocker: "redirect_limit_exceeded", networkRequestsMade, robotsChecksMade: 1 };
}

export async function executePublicArticleAcquisition(input = {}, {
  fetcher,
  robotsPolicyChecker,
  waiter = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const blockers = assessGate({ ...input, fetcher, robotsPolicyChecker });
  if (blockers.length) return safeResult({ blockers });

  const documents = [];
  const diagnostics = [];
  let networkRequestsMade = 0;
  let robotsChecksMade = 0;
  for (const [index, target] of input.plan.targets.entries()) {
    if (index > 0) await waiter(input.plan.limits.minimumIntervalMs);
    const result = await fetchOne(target, input.plan, { fetcher, robotsPolicyChecker });
    networkRequestsMade += result.networkRequestsMade;
    robotsChecksMade += result.robotsChecksMade;
    diagnostics.push({ sourceId: target.sourceId, status: result.ok ? "ready" : "blocked", blocker: result.blocker ?? null, networkRequestsMade: result.networkRequestsMade });
    if (!result.ok) return safeResult({ status: "public_article_acquisition_failed_closed", blockers: [`${target.sourceId}:${result.blocker}`], diagnostics, networkRequestsMade, robotsChecksMade });
    documents.push(result.document);
  }

  return safeResult({
    status: "public_article_acquisition_complete",
    blockers: [],
    documents,
    diagnostics,
    networkRequestsMade,
    robotsChecksMade,
    sourceBodiesFetched: documents.length === input.plan.targets.length,
  });
}
