const HANDOFF_EVENT = "ZHIHUI_DOUYIN_HANDOFF_V1";
const ACK_EVENT = "ZHIHUI_DOUYIN_CONNECTOR_ACK_V1";

function validPayload(value) {
  return value
    && value.version === 1
    && value.platform === "douyin"
    && typeof value.ideaId === "string"
    && typeof value.title === "string"
    && value.title.length > 0
    && value.title.length <= 30
    && typeof value.body === "string"
    && value.body.length > 0
    && value.body.length <= 20000
    && value.saveAllowed === false
    && value.publishAllowed === false;
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== HANDOFF_EVENT) return;
  const payload = event.data.payload;
  if (!validPayload(payload)) return;
  chrome.storage.local.set({ "zhihui:douyin-handoff:v1": payload }, () => {
    window.postMessage({ type:ACK_EVENT, ideaId:payload.ideaId }, window.location.origin);
  });
});
