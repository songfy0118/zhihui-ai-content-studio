export const REQUIRED_PLATFORMS: readonly string[];
export const REQUIRED_ARTIFACTS: readonly string[];
export type ArtifactCheck = { kind: string; verified: boolean; eligibleForProduction?: boolean; file?: string; reason?: string | null };
export function classifyArtifactForProduction(artifact: Record<string, unknown>): { eligibleForProduction: boolean; reason: string | null };
export type ProductionReadiness = {
  eligible: boolean;
  nextStatus: "review_pending" | null;
  checks: Array<{ id: string; ready: boolean; detail: string }>;
  blockers: string[];
  factReviewEvidence: { ready: boolean; blockers: string[]; claimCount: number; sourceCount: number; distinctHostCount: number; citedClaimCount: number; networkVerification: "not_run"; contentVerification: "human_recorded" | "not_recorded" };
  platformPackageEvidence: { ready: boolean; blockers: string[]; packageCount: number; requiredCount: number; performancePromiseDetected: boolean };
};
export function validateProductionReadiness(manifest: Record<string, unknown>, artifactChecks?: ArtifactCheck[], platformPackageEvidence?: ProductionReadiness["platformPackageEvidence"] | null): ProductionReadiness;
