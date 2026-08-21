import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";

console.log(JSON.stringify({ ...buildSourceLockSavePlan(null), externalCalls: 0 }, null, 2));
