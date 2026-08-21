export const FULL_CHAIN_CONFIRMATION = "APPLY_FULL_LOCAL_D1_CHAIN_0000_TO_0005";

export function assessD1ChainApplyRequest({ plan = {}, executeRequested = false, confirmation = "" } = {}) {
  const migrationLedgerObjects = Array.isArray(plan.migrationLedgerObjects) ? plan.migrationLedgerObjects : [];
  const planBlockers = Array.isArray(plan.blockers) ? plan.blockers : [];
  const blockers = [
    ...(!executeRequested ? ["execute_request_missing"] : []),
    ...(confirmation !== FULL_CHAIN_CONFIRMATION ? ["confirmation_mismatch"] : []),
    ...(!plan.sourcePlanReady ? ["source_plan_not_ready"] : []),
    ...(!plan.liveStateVerified ? ["live_database_state_not_verified"] : []),
    ...(!plan.readyForAuthorizedApply ? ["plan_not_ready_for_authorized_apply"] : []),
    ...(plan.databaseStatus !== "empty" ? ["database_not_empty"] : []),
    ...(plan.firstPending !== "0000_serious_tinkerer" ? ["first_pending_migration_mismatch"] : []),
    ...(migrationLedgerObjects.length ? ["migration_ledger_requires_review"] : []),
    ...planBlockers.map((blocker) => `plan:${blocker}`),
  ];
  const uniqueBlockers = [...new Set(blockers)];
  const eligible = uniqueBlockers.length === 0;

  return {
    mode: eligible ? "authorized_local_apply" : "plan_only",
    status: eligible ? "ready_for_manual_local_apply" : "blocked",
    eligible,
    requiredConfirmation: FULL_CHAIN_CONFIRMATION,
    executeRequested,
    confirmationMatched: confirmation === FULL_CHAIN_CONFIRMATION,
    localOnly: true,
    blockers: uniqueBlockers,
    commandPrepared: eligible,
    command: eligible ? {
      executable: "npx",
      args: ["wrangler", "d1", "migrations", "apply", "DB", "--local"],
      targetBinding: "DB",
      remote: false,
    } : null,
    manualExecutionRequired: true,
    executorInvoked: false,
    applyPerformed: false,
    databaseWrites: false,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
  };
}
