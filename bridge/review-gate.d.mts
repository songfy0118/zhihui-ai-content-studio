export const REQUIRED_REVIEW_CHECKS: readonly string[];

export type ReviewApprovalPayload = {
  action?: unknown;
  jobId?: unknown;
  checks?: unknown;
};

export type ReviewApprovalResult =
  | { ok: true; jobId: string; checks: Record<string, true> }
  | { ok: false; error: string; missing?: string[] };

export function validateReviewApproval(payload: ReviewApprovalPayload): ReviewApprovalResult;
export function validateReviewableStatus(status: unknown):
  | { ok: true; status: "review_pending" }
  | { ok: false; error: string; status: unknown };
