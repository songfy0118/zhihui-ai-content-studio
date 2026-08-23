import { createHash } from "node:crypto";

const MAX_SELECTIONS = 3;

function normalizedIds(selectedIds) {
  if (!Array.isArray(selectedIds)) return [];
  return [...new Set(selectedIds.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

function normalizedHost(value) {
  try {
    return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function buildEvidenceSearchPlan(leads = [], selectedIds = [], sources = []) {
  const selection = normalizedIds(selectedIds);
  const blockers = [];
  if (!selection.length) blockers.push("selection_empty");
  if (selection.length > MAX_SELECTIONS) blockers.push("selection_limit_exceeded");
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  for (const id of selection) {
    if (!leadsById.has(id)) blockers.push(`selected_lead_not_current:${id}`);
  }
  const selectedLeads = selection.flatMap((id) => leadsById.get(id) ?? []);
  const publicSources = sources.filter((source) => source.enabled && !source.requiresLogin && ["rss", "official_newsroom"].includes(source.sourceType));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const targets = selectedLeads.map((lead) => {
    const originalEvidence = (lead.evidence ?? []).slice(0, 1).map(({ id, sourceId, sourceName, title, canonicalUrl, publishedAt }) => ({ id, sourceId, sourceName, title, canonicalUrl, publishedAt }));
    const originalSource = sourcesById.get(lead.sourceId);
    const originalHosts = [...new Set([
      ...originalEvidence.map((item) => normalizedHost(item.canonicalUrl)),
      normalizedHost(originalSource?.baseUrl),
      normalizedHost(originalSource?.feedUrl),
    ].filter(Boolean))].sort();
    const excludedSources = [];
    const allowedSources = publicSources.flatMap((source) => {
      const sourceHost = normalizedHost(source.baseUrl);
      const reason = source.id === lead.sourceId
        ? "same_source_id"
        : sourceHost && originalHosts.includes(sourceHost) ? "same_exact_host" : null;
      if (reason) {
        excludedSources.push({ id: source.id, name: source.name, host: sourceHost, reason });
        return [];
      }
      const { id, name, sourceType, baseUrl, feedUrl } = source;
      return [{ id, name, sourceType, baseUrl, feedUrl }];
    });
    if (!allowedSources.length) blockers.push(`no_independent_public_sources:${lead.id}`);
    return {
      leadId: lead.id,
      title: lead.title,
      originalSourceId: lead.sourceId,
      sourcePublishedAt: lead.publishedAt,
      originalEvidence,
      status: "planned_not_executed",
      queries: lead.suggestedQueries.slice(0, 2),
      allowedSources,
      independenceDiagnostics: {
        policy: "source_id_and_exact_normalized_host",
        originalHosts,
        excludedSources,
      },
      requiredIndependentSources: lead.missingIndependentSources,
      resultsFound: 0,
      claimsVerified: 0,
      sourceLockReady: false,
    };
  });
  const ready = blockers.length === 0 && targets.length > 0;
  const fingerprint = ready
    ? createHash("sha256").update(targets.map((target) => `${target.leadId}\n${target.title}\n${target.allowedSources.map((source) => source.id).join(",")}`).join("\n---\n")).digest("hex")
    : null;

  return {
    status: ready ? "search_plan_ready" : "search_plan_blocked",
    readyForHumanResearchReview: ready,
    blockers,
    selection: { requested: selection.length, accepted: targets.length, maximum: MAX_SELECTIONS },
    targets,
    planFingerprint: fingerprint,
    allowedMethods: ["public_rss_metadata", "official_newsroom_public_page"],
    prohibitedMethods: ["login_bypass", "paywall_bypass", "captcha_bypass", "rate_limit_bypass"],
    automaticSearchAllowed: false,
    searchTriggered: false,
    factsVerified: false,
    sourceLocksCreated: 0,
    draftsUnlocked: 0,
    databaseWrites: false,
    publishTriggered: false,
  };
}
