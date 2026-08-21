import { assessBridgeProtocol } from "./protocol.mjs";

export const LOCAL_RUNTIME_SERVICES = [
  { id: "studio", url: "http://127.0.0.1:3000" },
  { id: "bridge", url: "http://127.0.0.1:3765/health" },
  { id: "local_mini_drama_api", url: "http://127.0.0.1:5679/health" },
  { id: "local_mini_drama_web", url: "http://127.0.0.1:3013" },
];

async function inspectService(service, fetchImpl, timeoutMs) {
  try {
    const response = await fetchImpl(service.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    let bridgeProtocol = null;
    if (service.id === "bridge" && response.ok) {
      const payload = await response.json();
      bridgeProtocol = assessBridgeProtocol(payload);
    }
    return { id: service.id, online: response.ok, statusCode: response.status, bridgeProtocol };
  } catch {
    return { id: service.id, online: false, statusCode: null, bridgeProtocol: null };
  }
}

export async function inspectLocalRuntime({ fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  const services = await Promise.all(LOCAL_RUNTIME_SERVICES.map((service) => inspectService(service, fetchImpl, timeoutMs)));
  const offlineServices = services.filter((service) => !service.online).map((service) => service.id);
  const bridge = services.find((service) => service.id === "bridge");
  const bridgeProtocol = bridge?.bridgeProtocol ?? assessBridgeProtocol();
  const current = offlineServices.length === 0 && bridgeProtocol.current;

  return {
    status: current ? "current" : offlineServices.length ? "services_offline" : "bridge_stale",
    current,
    services,
    offlineServices,
    bridgeProtocol,
    nextAction: offlineServices.length
      ? "run_start_local_studio"
      : bridgeProtocol.current
        ? "none"
        : "close_old_studio_and_rerun_launcher",
    processMutation: false,
    externalCalls: false,
    modelCalls: false,
    downloads: false,
    costIncurred: false,
    publishTriggered: false,
  };
}
