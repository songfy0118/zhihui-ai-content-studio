const STORAGE_KEY = "zhihui:douyin-handoff:v1";
const STATUS_KEY = "zhihui:douyin-handoff-status:v1";
let filling = false;
let completedIdeaId = null;

function visible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function findText(text) {
  return [...document.querySelectorAll("button,div,span")]
    .find((element) => element.textContent?.trim() === text && visible(element));
}

function setNativeValue(input, value) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertText", data:value }));
  input.dispatchEvent(new Event("change", { bubbles:true }));
}

function setEditorValue(editor, value) {
  editor.focus();
  editor.replaceChildren(...value.split("\n").map((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line || " ";
    return paragraph;
  }));
  editor.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertText", data:value }));
}

function validPayload(value) {
  return value
    && value.version === 1
    && value.platform === "douyin"
    && typeof value.title === "string"
    && value.title.length > 0
    && value.title.length <= 30
    && typeof value.body === "string"
    && value.body.length > 0
    && value.body.length <= 20000
    && value.saveAllowed === false
    && value.publishAllowed === false;
}

async function recordStatus(payload, status, detail) {
  await chrome.storage.local.set({ [STATUS_KEY]: {
    ideaId:payload.ideaId,
    status,
    detail,
    updatedAt:new Date().toISOString(),
    draftSaved:false,
    publishTriggered:false
  } });
}

async function fillWhenReady(payload) {
  if (filling || completedIdeaId === payload?.ideaId || !validPayload(payload)) return;
  filling = true;
  try {
    const articleTab = findText("发布文章");
    if (articleTab && !document.querySelector('input[placeholder*="文章标题"]')) {
      articleTab.click();
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    const startButton = findText("我要发文");
    if (startButton) {
      startButton.click();
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    const title = document.querySelector('input[placeholder*="文章标题"]');
    const summary = document.querySelector('input[placeholder*="内容摘要"]');
    const editor = [...document.querySelectorAll('[contenteditable="true"]')]
      .find((element) => visible(element) && (element.textContent?.includes("请输入正文") || element.closest("[class*='editor']")));
    if (!(title instanceof HTMLInputElement) || !(summary instanceof HTMLInputElement) || !(editor instanceof HTMLElement)) {
      await recordStatus(payload, "waiting_for_editor", "creator_editor_fields_not_ready");
      return;
    }

    setNativeValue(title, payload.title);
    setNativeValue(summary, String(payload.summary || payload.body).replace(/\s+/g, " ").slice(0, 30));
    setEditorValue(editor, payload.body);
    completedIdeaId = payload.ideaId;
    await recordStatus(payload, "prefilled_review_pending", "fields_filled_without_save_or_publish");
  } catch (error) {
    await recordStatus(payload, "fill_failed", error instanceof Error ? error.message : "unknown_error");
  } finally {
    filling = false;
  }
}

function loadPending() {
  chrome.storage.local.get(STORAGE_KEY, (result) => fillWhenReady(result[STORAGE_KEY]));
}

loadPending();
const observer = new MutationObserver(() => loadPending());
observer.observe(document.documentElement, { childList:true, subtree:true });
window.setTimeout(() => observer.disconnect(), 60000);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]?.newValue) fillWhenReady(changes[STORAGE_KEY].newValue);
});
