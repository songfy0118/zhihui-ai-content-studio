import { createHash } from "node:crypto";
import { isValidPilotReceiptConsumption } from "./pilot-authorization-receipts.mjs";

const REQUEST_HASH = /^[a-f0-9]{64}$/;

function selected(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildExecutionRequestHash({ requestHash, provider, imageModel, videoModel, imageCostCny, videoCostCny, maxCostCny, pricingConfirmed }) {
  if (!REQUEST_HASH.test(requestHash ?? "") || !selected(provider) || !selected(imageModel) || !selected(videoModel)) return null;
  if (![imageCostCny, videoCostCny, maxCostCny].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) return null;
  if (pricingConfirmed !== true) return null;
  const envelope = {
    requestHash,
    provider: provider.trim(),
    imageModel: imageModel.trim(),
    videoModel: videoModel.trim(),
    imageCostCny,
    videoCostCny,
    maxCostCny,
    pricingConfirmed: true,
  };
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

export function validatePilotExecutionApproval({
  candidate,
  credentialConfigured = false,
  localVoiceReady = false,
  provider = null,
  imageModel = null,
  videoModel = null,
  imageCostCny = null,
  videoCostCny = null,
  pricingConfirmed = false,
  maxCostCny = null,
  approvedRequestHash = null,
  userApproved = false,
} = {}) {
  const blockers = [];
  const requestHash = candidate?.requestHash;
  const validImageCost = typeof imageCostCny === "number" && Number.isFinite(imageCostCny) && imageCostCny > 0;
  const validVideoCost = typeof videoCostCny === "number" && Number.isFinite(videoCostCny) && videoCostCny > 0;
  const validMaxCost = typeof maxCostCny === "number" && Number.isFinite(maxCostCny) && maxCostCny > 0;
  const quotedTotalCostCny = validImageCost && validVideoCost ? Number((imageCostCny + videoCostCny).toFixed(6)) : null;
  const executionRequestHash = buildExecutionRequestHash({ requestHash, provider, imageModel, videoModel, imageCostCny, videoCostCny, maxCostCny, pricingConfirmed });

  if (!candidate || candidate.inputComplete !== true || !REQUEST_HASH.test(requestHash ?? "")) blockers.push("pilot_input_incomplete");
  if (!credentialConfigured) blockers.push("external_credential_missing");
  if (!localVoiceReady) blockers.push("local_voice_not_ready");
  if (!selected(provider)) blockers.push("provider_not_selected");
  if (!selected(imageModel)) blockers.push("image_model_not_selected");
  if (!selected(videoModel)) blockers.push("video_model_not_selected");
  if (!validImageCost) blockers.push("image_cost_not_set");
  if (!validVideoCost) blockers.push("video_cost_not_set");
  if (pricingConfirmed !== true) blockers.push("pricing_not_confirmed");
  if (!validMaxCost) blockers.push("max_cost_not_set");
  if (quotedTotalCostCny !== null && validMaxCost && quotedTotalCostCny > maxCostCny) blockers.push("cost_cap_exceeded");
  if (userApproved !== true) blockers.push("explicit_approval_missing");
  if (userApproved === true && approvedRequestHash !== executionRequestHash) blockers.push("request_fingerprint_mismatch");

  return {
    eligible: blockers.length === 0,
    status: blockers.length === 0 ? "approved_for_single_pilot" : "blocked",
    blockers,
    requestHash: REQUEST_HASH.test(requestHash ?? "") ? requestHash : null,
    executionRequestHash,
    approvedRequestHash: selected(approvedRequestHash) ? approvedRequestHash : null,
    imageCostCny: validImageCost ? imageCostCny : null,
    videoCostCny: validVideoCost ? videoCostCny : null,
    quotedTotalCostCny,
    pricingConfirmed: pricingConfirmed === true,
    pricingSource: "manual_user_confirmed_quote",
    maxCostCny: validMaxCost ? maxCostCny : null,
    approvalScope: "single_storyboard_pilot",
    automaticExecution: false,
    secretsConsumed: false,
    externalCalls: false,
    costIncurred: false,
  };
}

export function planPilotExecution({
  executionRequested = false,
  executorAvailable = false,
  receiptConsumption = null,
  ...approvalInput
} = {}) {
  const gate = validatePilotExecutionApproval(approvalInput);
  const blockers = [...gate.blockers];

  if (gate.eligible) {
    if (executionRequested !== true) blockers.push("execution_not_requested");
    if (executorAvailable !== true) blockers.push("executor_unavailable");
    if (executionRequested === true && executorAvailable === true && !isValidPilotReceiptConsumption(receiptConsumption, gate.executionRequestHash)) blockers.push("authorization_receipt_required");
  }

  const receiptConsumed = isValidPilotReceiptConsumption(receiptConsumption, gate.executionRequestHash);
  const readyForAdapterCall = gate.eligible && executionRequested === true && executorAvailable === true && receiptConsumed;
  return {
    state: !gate.eligible ? "blocked" : readyForAdapterCall ? "ready_for_adapter_call" : "awaiting_execution_setup",
    blockers,
    gate,
    readyForAdapterCall,
    authorizationReceiptRequired: true,
    authorizationReceiptConsumed: receiptConsumed,
    singleUse: true,
    automaticExecution: false,
    executionTriggered: false,
    generatedMedia: false,
    externalCalls: false,
    costIncurred: false,
    publishable: false,
  };
}
