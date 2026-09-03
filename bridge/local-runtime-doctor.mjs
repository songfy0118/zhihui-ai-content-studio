import { assessBridgeProtocol } from "./protocol.mjs";

export const LOCAL_RUNTIME_SERVICES = [
  { id: "studio", url: "http://127.0.0.1:3000" },
  { id: "bridge", url: "http://127.0.0.1:3765/health" },
  { id: "local_mini_drama_api", url: "http://127.0.0.1:5679/health" },
  { id: "local_mini_drama_web", url: "http://127.0.0.1:3013" },
  { id: "ollama", url: "http://127.0.0.1:11434/api/tags" },
];
export const REQUIRED_OLLAMA_MODEL = "qwen3:4b";

async function inspectService(service, fetchImpl, timeoutMs) {
  try {
    const response = await fetchImpl(service.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    let bridgeProtocol = null;
    let modelReady = null;
    if (service.id === "bridge" && response.ok) {
      const payload = await response.json();
      bridgeProtocol = assessBridgeProtocol(payload);
    }
    if (service.id === "ollama" && response.ok) {
      const payload = await response.json();
      const names = Array.isArray(payload?.models)
        ? payload.models.flatMap((model) => [model?.name, model?.model]).filter((name) => typeof name === "string")
        : [];
      modelReady = names.includes(REQUIRED_OLLAMA_MODEL);
    }
    return { id: service.id, online: response.ok, statusCode: response.status, bridgeProtocol, modelReady };
  } catch {
    return { id: service.id, online: false, statusCode: null, bridgeProtocol: null, modelReady: null };
  }
}

export async function inspectLocalRuntime({ fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  const services = await Promise.all(LOCAL_RUNTIME_SERVICES.map((service) => inspectService(service, fetchImpl, timeoutMs)));
  const offlineServices = services.filter((service) => !service.online).map((service) => service.id);
  const bridge = services.find((service) => service.id === "bridge");
  const bridgeProtocol = bridge?.bridgeProtocol ?? assessBridgeProtocol();
  const ollamaModelReady = services.find((service) => service.id === "ollama")?.modelReady === true;
  const current = offlineServices.length === 0 && bridgeProtocol.current && ollamaModelReady;

  return {
    status: current ? "current" : offlineServices.length ? "services_offline" : !bridgeProtocol.current ? "bridge_stale" : "models_missing",
    current,
    services,
    offlineServices,
    bridgeProtocol,
    requiredOllamaModel: REQUIRED_OLLAMA_MODEL,
    ollamaModelReady,
    nextAction: offlineServices.includes("ollama")
      ? "install_or_start_ollama"
      : offlineServices.length
        ? "run_start_local_studio"
        : !bridgeProtocol.current
          ? "close_old_studio_and_rerun_launcher"
          : ollamaModelReady
            ? "none"
            : "pull_qwen3_4b",
    processMutation: false,
    externalCalls: false,
    modelCalls: false,
    downloads: false,
    costIncurred: false,
    publishTriggered: false,
  };
}
