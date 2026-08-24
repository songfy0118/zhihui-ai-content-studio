import { createHash } from "node:crypto";

import {
  NEWS_SOURCE_CATALOG,
  NEWS_SOURCE_CATALOG_VERSION,
  validateNewsSourceCatalog,
} from "./news-source-catalog.mjs";

const POLICY = Object.freeze({
  automaticCollectionScope: "rss_metadata_only",
  manualPublicPageRequiresHuman: true,
  userSuppliedLinksRequireHuman: true,
  articleBodiesFetched: false,
  loginTriggered: false,
  captchaBypassed: false,
  paywallBypassed: false,
  externalCalls: 0,
  factsVerified: false,
  sourceLocksCreated: 0,
  databaseWrites: false,
  publishTriggered: false,
});

function publicSourceRecord(source, collectionMode) {
  return Object.freeze({
    id: source.id,
    name: source.name,
    language: source.language,
    category: source.category,
    baseUrl: source.baseUrl,
    feedUrl: source.feedUrl,
    rightsPolicy: source.rightsPolicy,
    collectionMode,
    automaticCollectionBlockedReason: source.automaticCollectionBlockedReason ?? null,
  });
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildNewsSourceAcquisitionEligibility({
  sources = NEWS_SOURCE_CATALOG,
  catalogVersion = NEWS_SOURCE_CATALOG_VERSION,
} = {}) {
  const validation = validateNewsSourceCatalog(sources);
  const blockers = [...validation.blockers];
  const automaticRssMetadata = [];
  const manualPublicPageMetadata = [];
  const userSuppliedPublicLinkOnly = [];
  const unclassified = [];

  for (const source of sources) {
    if (source.enabled && !source.requiresLogin && source.sourceType === "rss" && source.feedUrl?.startsWith("https://")) {
      automaticRssMetadata.push(publicSourceRecord(source, "rss_metadata_only"));
      continue;
    }
    if (source.enabled && !source.requiresLogin && source.sourceType === "official_newsroom" && source.feedUrl === null) {
      manualPublicPageMetadata.push(publicSourceRecord(source, "manual_public_page_metadata"));
      continue;
    }
    if (!source.enabled && source.requiresLogin && source.sourceType === "manual_import" && source.feedUrl === null) {
      userSuppliedPublicLinkOnly.push(publicSourceRecord(source, "user_supplied_public_link_only"));
      continue;
    }
    unclassified.push(source.id);
    blockers.push(`unclassified_collection_boundary:${source.id}`);
  }

  const summary = Object.freeze({
    totalSources: sources.length,
    automaticRssMetadata: automaticRssMetadata.length,
    manualPublicPageMetadata: manualPublicPageMetadata.length,
    userSuppliedPublicLinkOnly: userSuppliedPublicLinkOnly.length,
    unclassified: unclassified.length,
  });
  const ready = blockers.length === 0 && (
    summary.automaticRssMetadata
    + summary.manualPublicPageMetadata
    + summary.userSuppliedPublicLinkOnly
  ) === summary.totalSources;
  const auditFingerprint = ready ? fingerprint({
    catalogVersion,
    summary,
    automaticRssMetadata,
    manualPublicPageMetadata,
    userSuppliedPublicLinkOnly,
    policy: POLICY,
  }) : null;

  return Object.freeze({
    status: ready ? "source_acquisition_eligibility_ready" : "source_acquisition_eligibility_blocked",
    blockers: Object.freeze(blockers),
    catalogVersion,
    auditFingerprint,
    summary,
    automaticRssMetadata: Object.freeze(automaticRssMetadata),
    manualPublicPageMetadata: Object.freeze(manualPublicPageMetadata),
    userSuppliedPublicLinkOnly: Object.freeze(userSuppliedPublicLinkOnly),
    unclassified: Object.freeze(unclassified),
    ...POLICY,
  });
}
