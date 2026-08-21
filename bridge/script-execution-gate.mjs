import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/;

function selected(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildAuthorizationHash({ sourceLockFingerprint, provider, textModel, quotedCostCny, pricingConfirmed, maxCostCny }) {
  const quoteValid = typeof quotedCostCny === "number" && Number.isFinite(quotedCostCny) && quotedCostCny >= 0;
  const capValid = typeof maxCostCny === "number" && Number.isFinite(maxCostCny) && maxCostCny > 0;
  if (!SHA256.test(sourceLockFingerprint ?? "") || !selected(provider) || !selected(textModel) || !quoteValid || !capValid || pricingConfirmed !== true) return null;
  return createHash("sha256").update(JSON.stringify({
    sourceLockFingerprint,
    provider: provider.trim(),
    textModel: textModel.trim(),
    quotedCostCny,
    pricingConfirmed: true,
    maxCostCny,
  })).digest("hex");
}

export function validateScriptExecutionApproval({
  planReady = false,
  sourceLockFingerprint = null,
  credentialConfigured = false,
  provider = null,
  textModel = null,
  quotedCostCny = null,
  pricingConfirmed = false,
  maxCostCny = null,
  approvedRequestHash = null,
  userApproved = false,
} = {}) {
  const blockers = [];
  const validFingerprint = SHA256.test(sourceLockFingerprint ?? "");
  const validQuote = typeof quotedCostCny === "number" && Number.isFinite(quotedCostCny) && quotedCostCny >= 0;
  const validMaxCost = typeof maxCostCny === "number" && Number.isFinite(maxCostCny) && maxCostCny > 0;
  const executionRequestHash = buildAuthorizationHash({ sourceLockFingerprint, provider, textModel, quotedCostCny, pricingConfirmed, maxCostCny });

  if (planReady !== true || !validFingerprint) blockers.push("source_locked_plan_not_ready");
  if (credentialConfigured !== true) blockers.push("text_credential_missing");
  if (!selected(provider)) blockers.push("provider_not_selected");
  if (!selected(textModel)) blockers.push("text_model_not_selected");
  if (!validQuote) blockers.push("script_cost_not_set");
  if (pricingConfirmed !== true) blockers.push("pricing_not_confirmed");
  if (!validMaxCost) blockers.push("max_cost_not_set");
  if (validQuote && validMaxCost && quotedCostCny > maxCostCny) blockers.push("cost_cap_exceeded");
  if (userApproved !== true) blockers.push("explicit_approval_missing");
  if (userApproved === true && approvedRequestHash !== executionRequestHash) blockers.push("request_fingerprint_mismatch");

  return {
    eligible: blockers.length === 0,
    status: blockers.length === 0 ? "approved_for_single_script_request" : "blocked",
    blockers,
    sourceLockFingerprint: validFingerprint ? sourceLockFingerprint : null,
    executionRequestHash,
    approvedRequestHash: selected(approvedRequestHash) ? approvedRequestHash : null,
    provider: selected(provider) ? provider.trim() : null,
    textModel: selected(textModel) ? textModel.trim() : null,
    quotedCostCny: validQuote ? quotedCostCny : null,
    pricingConfirmed: pricingConfirmed === true,
    pricingSource: "manual_user_confirmed_quote",
    maxCostCny: validMaxCost ? maxCostCny : null,
    approvalScope: "single_source_locked_script_request",
    automaticExecution: false,
    secretsConsumed: false,
    modelCalls: 0,
    externalCalls: 0,
    costIncurred: false,
    scriptGenerated: false,
    publishable: false,
  };
}
