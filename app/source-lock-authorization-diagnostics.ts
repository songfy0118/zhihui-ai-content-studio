const sourceLockAuthorizationBlockerLabels: Record<string, string> = {
  source_lock_save_plan_invalid_or_tampered: "保存计划无效或已变化，请重新生成来源锁保存计划",
};

export function formatSourceLockAuthorizationBlocker(blocker: string) {
  return sourceLockAuthorizationBlockerLabels[blocker] ?? blocker;
}
