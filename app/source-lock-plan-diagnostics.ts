const sourceLockPlanBlockerLabels: Record<string, string> = {
  invalid_save_plan_request: "保存计划请求已失效，请重新完成证据审查",
  evidence_review_not_ready: "当前证据审查尚未通过",
  review_fingerprint_missing: "当前审查缺少可绑定的指纹",
  review_fingerprint_confirmation_required: "需要确认当前审查指纹",
  review_fingerprint_mismatch: "审查指纹已变化，请重新生成计划",
  no_source_locks_planned: "没有符合条件的来源锁记录可规划",
};

export function formatSourceLockPlanBlocker(blocker: string) {
  if (blocker.startsWith("review_target_not_eligible:")) {
    return `线索 ${blocker.slice("review_target_not_eligible:".length)}：审查证据不完整，不能进入保存计划`;
  }
  return sourceLockPlanBlockerLabels[blocker] ?? blocker;
}
