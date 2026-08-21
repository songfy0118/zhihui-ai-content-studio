const REQUIRED_HUMAN_CHECKS = Object.freeze([
  "facts_match_source_lock",
  "no_uncited_factual_claims",
  "uncertainty_preserved",
  "source_notes_present",
  "platform_safety_checked",
]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

function addBlocker(blockers, blocker) {
  if (!blockers.includes(blocker)) blockers.push(blocker);
}

export function assessScriptOutput({ envelope = {}, output = {} } = {}) {
  const blockers = [];
  const knownClaims = Array.isArray(envelope.claims) ? envelope.claims : [];
  const knownClaimIds = new Set(knownClaims.map((claim) => normalizeText(claim?.id)).filter(Boolean));
  const usageRows = Array.isArray(output.claimUsage) ? output.claimUsage : null;
  const uncitedClaims = Array.isArray(output.uncitedFactualClaims)
    ? output.uncitedFactualClaims
    : null;
  const review = output.review && typeof output.review === "object" ? output.review : {};
  const checks = review.checks && typeof review.checks === "object" ? review.checks : {};

  if (!envelope.ready || !normalizeText(envelope.inputFingerprint)) {
    addBlocker(blockers, "source_lock_not_ready");
  }
  if (normalizeText(output.sourceLockFingerprint) !== normalizeText(envelope.inputFingerprint)) {
    addBlocker(blockers, "source_lock_mismatch");
  }
  if (!normalizeText(output.content) && output.scriptContentPresent !== true) {
    addBlocker(blockers, "script_content_missing");
  }

  if (!usageRows) {
    addBlocker(blockers, "claim_usage_missing");
  } else {
    const seenClaimIds = new Set();
    for (const row of usageRows) {
      const claimId = normalizeText(row?.claimId);
      if (!knownClaimIds.has(claimId)) {
        addBlocker(blockers, "unknown_claim_reference");
        continue;
      }
      if (seenClaimIds.has(claimId)) addBlocker(blockers, "duplicate_claim_reference");
      seenClaimIds.add(claimId);

      if (typeof row?.included !== "boolean") {
        addBlocker(blockers, "claim_inclusion_missing");
        continue;
      }
      const sourceRefs = Array.isArray(row.sourceRefs)
        ? [...new Set(row.sourceRefs.map(normalizeText).filter(Boolean))]
        : [];
      const allowedRefs = new Set(
        (knownClaims.find((claim) => normalizeText(claim?.id) === claimId)?.sourceRefs || [])
          .map(normalizeText)
          .filter(Boolean),
      );
      if (row.included && sourceRefs.length === 0) addBlocker(blockers, "included_claim_sources_missing");
      if (!row.included && sourceRefs.length > 0) addBlocker(blockers, "excluded_claim_has_sources");
      if (sourceRefs.some((sourceRef) => !allowedRefs.has(sourceRef))) {
        addBlocker(blockers, "source_reference_mismatch");
      }
    }
    if (knownClaims.some((claim) => !seenClaimIds.has(normalizeText(claim?.id)))) {
      addBlocker(blockers, "claim_usage_incomplete");
    }
  }

  if (!uncitedClaims) {
    addBlocker(blockers, "uncited_factual_claims_attestation_missing");
  } else if (uncitedClaims.length > 0) {
    addBlocker(blockers, "uncited_factual_claims_present");
  }

  if (review.status !== "reviewed") addBlocker(blockers, "human_review_required");
  if (!isReviewDate(review.reviewedAt)) addBlocker(blockers, "review_date_missing");
  if (REQUIRED_HUMAN_CHECKS.some((check) => checks[check] !== true)) {
    addBlocker(blockers, "human_checks_incomplete");
  }

  const ready = blockers.length === 0;
  return {
    status: ready ? "ready_for_character_and_storyboard" : "blocked",
    ready,
    blockers,
    sourceLockFingerprint: normalizeText(envelope.inputFingerprint) || null,
    counts: {
      knownClaims: knownClaims.length,
      accountedClaims: usageRows
        ? new Set(usageRows.map((row) => normalizeText(row?.claimId)).filter((id) => knownClaimIds.has(id))).size
        : 0,
      includedClaims: usageRows
        ? usageRows.filter((row) => knownClaimIds.has(normalizeText(row?.claimId)) && row?.included === true).length
        : 0,
      uncitedFactualClaims: uncitedClaims?.length ?? null,
    },
    requiredHumanChecks: [...REQUIRED_HUMAN_CHECKS],
    semanticVerification: "human_required",
    automatedFactVerification: false,
    modelCalls: 0,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishTriggered: false,
    businessResult: false,
  };
}
