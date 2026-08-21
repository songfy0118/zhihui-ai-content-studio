import assert from "node:assert/strict";
import { SOCIAL_DRAFT_PROTOCOL_VERSION } from "../bridge/social-draft-handoff.mjs";

const studioUrl = process.env.ZHIHUI_STUDIO_URL ?? "http://127.0.0.1:3000";

async function readJson(path) {
  const response = await fetch(`${studioUrl}${path}`, { signal:AbortSignal.timeout(5_000) });
  const payload = await response.json();
  return { status:response.status, ok:response.ok, payload };
}

let result;
try {
  const [base, project] = await Promise.all([
    readJson("/api/local/social-draft-handoff"),
    readJson("/api/local/social-draft-handoff?project=octopus-pilot"),
  ]);
  const reportedVersion = Number.isInteger(base.payload?.draftHandoffProtocolVersion)
    ? base.payload.draftHandoffProtocolVersion
    : null;
  const packagePlan = project.ok ? project.payload?.packagePlan : null;
  const packagePlanPresent = packagePlan != null;
  const deliveryReady = packagePlan?.readyForHumanDraftReview === true;
  const deliveryBlockers = Array.isArray(packagePlan?.blockers) ? packagePlan.blockers : [];
  const current = base.ok && project.ok && reportedVersion === SOCIAL_DRAFT_PROTOCOL_VERSION && packagePlanPresent;
  result = {
    status:current ? "current" : "stale",
    current,
    expectedProtocolVersion:SOCIAL_DRAFT_PROTOCOL_VERSION,
    reportedProtocolVersion:reportedVersion,
    packagePlanPresent,
    deliveryReady,
    deliveryBlockers,
    httpStatus:{ base:base.status, project:project.status },
    blockers:current ? [] : [
      ...(reportedVersion === SOCIAL_DRAFT_PROTOCOL_VERSION ? [] : ["draft_protocol_version_mismatch"]),
      ...(packagePlanPresent ? [] : ["draft_package_plan_missing"]),
    ],
    restartRequired:!current,
    restartAttempted:false,
    processMutation:false,
    externalCalls:false,
    uploadTriggered:false,
    draftSaveTriggered:false,
    publishTriggered:false,
  };
} catch {
  result = {
    status:"offline",
    current:false,
    expectedProtocolVersion:SOCIAL_DRAFT_PROTOCOL_VERSION,
    reportedProtocolVersion:null,
    packagePlanPresent:false,
    deliveryReady:false,
    deliveryBlockers:[],
    httpStatus:null,
    blockers:["studio_unavailable"],
    restartRequired:true,
    restartAttempted:false,
    processMutation:false,
    externalCalls:false,
    uploadTriggered:false,
    draftSaveTriggered:false,
    publishTriggered:false,
  };
}

console.log(JSON.stringify(result, null, 2));
assert.equal(result.processMutation, false);
assert.equal(result.publishTriggered, false);
process.exitCode = result.current ? 0 : 2;
