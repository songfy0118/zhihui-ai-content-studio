import { validateFactReview } from "./fact-review-policy.mjs";
import { validatePlatformPackages } from "./platform-package-policy.mjs";

export const REQUIRED_PLATFORMS = Object.freeze(["douyin", "tiktok", "xiaohongshu"]);
export const REQUIRED_ARTIFACTS = Object.freeze(["video", "audio", "subtitles"]);

export function classifyArtifactForProduction(artifact) {
  const resultType = String(artifact?.resultType ?? artifact?.result_type ?? "").toLowerCase();
  const normalizedFile = String(artifact?.file ?? artifact?.sourcePath ?? "").replaceAll("\\", "/").toLowerCase();
  const smokePath = normalizedFile.split("/").some((segment) => /(^|[-_.])smoke($|[-_.])/.test(segment));
  const explicitlyNonProduction = artifact?.businessEvidence === false
    || artifact?.business_evidence === false
    || artifact?.publishable === false;
  if (resultType === "smoke_test" || smokePath || explicitlyNonProduction) {
    return { eligibleForProduction: false, reason: "smoke_or_non_production_artifact" };
  }
  return { eligibleForProduction: true, reason: null };
}

export function validateProductionReadiness(manifest, artifactChecks = [], suppliedPlatformEvidence = null) {
  const factReviewEvidence = validateFactReview(manifest?.fact_review);
  const platformPackageEvidence = suppliedPlatformEvidence ?? validatePlatformPackages(manifest?.platform_copy);
  const checks = [
    {
      id: "fact_review",
      ready: factReviewEvidence.ready,
      detail: factReviewEvidence.ready
        ? `${factReviewEvidence.claimCount} claims linked to ${factReviewEvidence.sourceCount} retained sources`
        : `Fact evidence blocked: ${factReviewEvidence.blockers.join(", ")}`,
    },
    {
      id: "platform_packages",
      ready: REQUIRED_PLATFORMS.every((platform) => manifest?.platforms?.includes(platform)) && platformPackageEvidence.ready,
      detail: platformPackageEvidence.ready ? "Three distinct platform copy files passed policy checks" : `Platform copy blocked: ${platformPackageEvidence.blockers.join(", ")}`,
    },
    {
      id: "media_status",
      ready: manifest?.media_status === "ready_for_review",
      detail: "Rendered media must explicitly be marked ready_for_review",
    },
    {
      id: "artifacts",
      ready: REQUIRED_ARTIFACTS.every((kind) => artifactChecks.some((artifact) => artifact.kind === kind && artifact.verified === true && artifact.eligibleForProduction !== false)),
      detail: "Video, audio, and subtitle files must exist, match their SHA-256 checksums, and not be smoke/test artifacts",
    },
    {
      id: "human_gate",
      ready: manifest?.requires_human_review === true,
      detail: "The package must keep human review enabled",
    },
  ];
  const blockers = checks.filter((check) => !check.ready).map((check) => check.id);
  return {
    eligible: blockers.length === 0,
    nextStatus: blockers.length === 0 ? "review_pending" : null,
    checks,
    blockers,
    factReviewEvidence,
    platformPackageEvidence,
  };
}
