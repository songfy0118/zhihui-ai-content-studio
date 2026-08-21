export const BRIDGE_PROTOCOL_VERSION = 3;
export const BRIDGE_CAPABILITIES = [
  "engine_readiness",
  "cosyvoice_preflight",
  "musetalk_preflight",
  "moneyprinter_preflight",
  "isolated_d1_chain_verification",
];

export function assessBridgeProtocol(payload = {}) {
  const reportedVersion = Number.isInteger(payload.protocolVersion) ? payload.protocolVersion : null;
  const reportedCapabilities = Array.isArray(payload.capabilities) ? payload.capabilities.filter((item) => typeof item === "string") : [];
  const missingCapabilities = BRIDGE_CAPABILITIES.filter((capability) => !reportedCapabilities.includes(capability));
  const current = reportedVersion === BRIDGE_PROTOCOL_VERSION && missingCapabilities.length === 0;
  return {
    status: current ? "current" : "stale",
    current,
    expectedVersion: BRIDGE_PROTOCOL_VERSION,
    reportedVersion,
    requiredCapabilities: BRIDGE_CAPABILITIES,
    reportedCapabilities,
    missingCapabilities,
    blockers: current ? [] : [reportedVersion === null ? "protocol_version_missing" : "protocol_version_mismatch", ...(missingCapabilities.length ? ["capabilities_missing"] : [])],
    restartRequired: !current,
    restartTriggered: false,
    processMutation: false,
    externalCalls: false,
    costIncurred: false,
  };
}
