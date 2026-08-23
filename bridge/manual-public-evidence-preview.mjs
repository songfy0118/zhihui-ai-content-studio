import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { titleSimilarity, tokenizeNewsTitle } from "./topic-clustering.mjs";

const MAX_INPUTS = 3;
const DEFAULT_WINDOW_HOURS = 24 * 7;
const DEFAULT_MINIMUM_SIMILARITY = 0.12;
const DEFAULT_MINIMUM_SHARED_TERMS = 2;
const PUBLISHER_ROLES = new Set(["original_publisher", "syndicated_or_repost"]);

function timestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedHost(value) {
  try {
    return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "").replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

function isPublicLookingHost(hostname) {
  if (!hostname || hostname === "localhost" || !hostname.includes(".")) return false;
  if ([".localhost", ".local", ".internal", ".lan", ".home", ".test", ".example", ".invalid"].some((suffix) => hostname.endsWith(suffix))) return false;
  const ipKind = isIP(hostname);
  if (ipKind === 4) return !isPrivateIpv4(hostname);
  if (ipKind === 6) return !/^(::|::1|fc|fd|fe8|fe9|fea|feb|2001:db8)/i.test(hostname);
  return true;
}

function parsePublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    const host = normalizedHost(url.href);
    if (url.protocol !== "https:" || url.username || url.password || !isPublicLookingHost(host)) return null;
    return { canonicalUrl: url.href, host };
  } catch {
    return null;
  }
}

function sharedTerms(leftTitle, rightTitle) {
  const left = tokenizeNewsTitle(leftTitle);
  const right = tokenizeNewsTitle(rightTitle);
  return [...left].filter((term) => right.has(term)).sort();
}

export function buildManualPublicEvidencePreview(plan, inputs = [], {
  windowHours = DEFAULT_WINDOW_HOURS,
  minimumSimilarity = DEFAULT_MINIMUM_SIMILARITY,
  minimumSharedTerms = DEFAULT_MINIMUM_SHARED_TERMS,
} = {}) {
  const blockers = [];
  if (!plan?.readyForHumanResearchReview || !plan.planFingerprint) blockers.push("search_plan_not_ready");
  if (!Array.isArray(inputs) || inputs.length === 0) blockers.push("manual_evidence_input_empty");
  if (Array.isArray(inputs) && inputs.length > MAX_INPUTS) blockers.push("manual_evidence_input_limit_exceeded");
  const targetsById = new Map((plan?.targets ?? []).map((target) => [target.leadId, target]));
  const seenLeadIds = new Set();
  const accepted = [];

  for (const [index, input] of (Array.isArray(inputs) ? inputs.slice(0, MAX_INPUTS) : []).entries()) {
    const prefix = `manual_candidate_invalid:${index}`;
    const leadId = typeof input?.leadId === "string" ? input.leadId.trim() : "";
    const target = targetsById.get(leadId);
    const sourceName = typeof input?.sourceName === "string" ? input.sourceName.normalize("NFKC").trim() : "";
    const title = typeof input?.title === "string" ? input.title.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
    const publisherRole = typeof input?.publisherRole === "string" ? input.publisherRole : "";
    const parsedUrl = parsePublicHttpsUrl(input?.canonicalUrl);
    const publishedAtMs = timestamp(input?.publishedAt);
    const targetTimeMs = timestamp(target?.sourcePublishedAt);
    const inputBlockers = [];
    if (!target) inputBlockers.push(`${prefix}:lead_not_current`);
    if (seenLeadIds.has(leadId)) inputBlockers.push(`${prefix}:duplicate_lead`);
    if (sourceName.length < 2 || sourceName.length > 80) inputBlockers.push(`${prefix}:source_name_invalid`);
    if (title.length < 8 || title.length > 300) inputBlockers.push(`${prefix}:title_invalid`);
    if (!PUBLISHER_ROLES.has(publisherRole)) inputBlockers.push(`${prefix}:publisher_role_invalid`);
    if (!parsedUrl) inputBlockers.push(`${prefix}:public_https_url_required`);
    if (publishedAtMs === null || targetTimeMs === null) inputBlockers.push(`${prefix}:published_at_invalid`);
    if (publishedAtMs !== null && targetTimeMs !== null && Math.abs(publishedAtMs - targetTimeMs) > windowHours * 3_600_000) inputBlockers.push(`${prefix}:outside_time_window`);
    const originalHosts = new Set(target?.independenceDiagnostics?.originalHosts ?? []);
    if (parsedUrl?.host && originalHosts.has(parsedUrl.host)) inputBlockers.push(`${prefix}:same_exact_host`);
    const terms = target ? sharedTerms(target.title, title) : [];
    const similarity = target ? titleSimilarity(target.title, title) : 0;
    if (target && (terms.length < minimumSharedTerms || similarity < minimumSimilarity)) inputBlockers.push(`${prefix}:title_match_below_threshold`);
    blockers.push(...inputBlockers);
    if (inputBlockers.length) continue;
    seenLeadIds.add(leadId);
    const publishedDeltaHours = Number(((publishedAtMs - targetTimeMs) / 3_600_000).toFixed(1));
    accepted.push({
      leadId,
      candidate: {
        id: `manual:${createHash("sha256").update(`${leadId}\n${parsedUrl.canonicalUrl}`).digest("hex").slice(0, 16)}`,
        sourceId: `manual-public:${parsedUrl.host}`,
        sourceName,
        title,
        publisherRole,
        canonicalUrl: parsedUrl.canonicalUrl,
        publishedAt: new Date(publishedAtMs).toISOString(),
        candidateHost: parsedUrl.host,
        publishedDeltaHours,
        titleSimilarity: Number(similarity.toFixed(4)),
        sharedTerms: terms,
        reviewStatus: "human_review_required",
        inputMode: "user_supplied_public_metadata",
      },
    });
  }

  const targets = (plan?.targets ?? []).map((target) => {
    const candidates = accepted.filter((entry) => entry.leadId === target.leadId).map((entry) => entry.candidate);
    return {
      leadId: target.leadId,
      title: target.title,
      originalSourceId: target.originalSourceId,
      originalEvidence: target.originalEvidence?.[0] ?? null,
      originalHost: target.independenceDiagnostics?.originalHosts?.[0] ?? null,
      candidates,
      candidateCount: candidates.length,
      sourceLockReady: false,
      factsVerified: false,
    };
  });
  const ready = blockers.length === 0 && accepted.length > 0;

  return {
    status: ready ? "manual_evidence_preview_ready" : "manual_evidence_preview_blocked",
    readyForHumanEvidenceReview: ready,
    blockers,
    planFingerprint: plan?.planFingerprint ?? null,
    summary: { inputsReceived: Array.isArray(inputs) ? inputs.length : 0, candidatesAccepted: accepted.length, maximum: MAX_INPUTS },
    targets,
    validationPolicy: { publicHttpsOnly: true, exactHostDifferentRequired: true, windowHours, minimumSimilarity, minimumSharedTerms },
    candidateUrlFetched: false,
    articleBodiesFetched: false,
    manualInputPersisted: false,
    factsVerified: false,
    sourceLocksCreated: 0,
    draftsUnlocked: 0,
    databaseWrites: false,
    publishTriggered: false,
  };
}
