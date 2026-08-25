type ManualEvidenceFormInput = {
  leadId: string;
  sourceName: string;
  publisherRole: string;
  title: string;
  canonicalUrl: string;
  publishedAt: string;
};

const ISO_8601_WITH_TIMEZONE = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_EVIDENCE_WINDOW_HOURS = 24 * 7;
const DEFAULT_MINIMUM_TITLE_SIMILARITY = 0.12;
const DEFAULT_MINIMUM_SHARED_TITLE_TERMS = 2;
const TITLE_STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "is", "it", "new", "of", "on", "the", "to", "with", "ai"]);

const REQUIRED_FIELDS = [
  ["leadId", "待补证标题"],
  ["sourceName", "来源名称"],
  ["publisherRole", "发布者身份"],
  ["title", "候选标题"],
  ["canonicalUrl", "公开 HTTPS 链接"],
  ["publishedAt", "发布时间"],
] as const;

export function buildManualEvidenceFormReadiness(input: ManualEvidenceFormInput) {
  const items = REQUIRED_FIELDS.map(([id, label]) => ({ id, label, complete:Boolean(input[id].trim()) }));
  const completed = items.filter((item) => item.complete).length;
  return {
    items,
    completed,
    total:items.length,
    ready:completed === items.length,
    missingLabels:items.filter((item) => !item.complete).map((item) => item.label),
  };
}

export function assessManualEvidencePublishedAt(publishedAt: string, nowMs = Date.now()) {
  const value = publishedAt.trim();
  if (!value) return { status:"awaiting_time" as const, message:null, blocksPreview:false };
  const match = ISO_8601_WITH_TIMEZONE.exec(value);
  const parsedMs = Date.parse(value);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const maximumDay = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (!match || !Number.isFinite(parsedMs) || day < 1 || day > maximumDay) {
    return { status:"invalid_time" as const, message:"发布时间必须是带时区的 ISO 8601，例如 2026-08-23T08:00:00Z；不会发送当前预览请求", blocksPreview:true };
  }
  if (parsedMs > nowMs + FUTURE_CLOCK_SKEW_MS) {
    return { status:"future_time" as const, message:"发布时间晚于当前时间；请核对时区或日期，不会发送当前预览请求", blocksPreview:true };
  }
  return { status:"valid" as const, message:"发布时间格式已通过本地校验；服务器仍会核对与原来源的 7 天时间窗", blocksPreview:false };
}

export function assessManualEvidenceTimeWindow(publishedAt: string, sourcePublishedAt: string | null | undefined, nowMs = Date.now(), windowHours = DEFAULT_EVIDENCE_WINDOW_HOURS) {
  const publishedAtAssessment = assessManualEvidencePublishedAt(publishedAt, nowMs);
  if (publishedAtAssessment.status !== "valid") return { ...publishedAtAssessment, deltaHours:null };
  if (!sourcePublishedAt) {
    return { status:"awaiting_source_time" as const, message:"选择待补证标题后，将在本地核对与原来源的 7 天时间窗", blocksPreview:false, deltaHours:null };
  }
  const sourcePublishedAtMs = Date.parse(sourcePublishedAt);
  if (!Number.isFinite(sourcePublishedAtMs)) {
    return { status:"invalid_source_time" as const, message:"原来源发布时间无效；请重新生成补证清单，不会发送当前预览请求", blocksPreview:true, deltaHours:null };
  }
  const rawDeltaHours = (Date.parse(publishedAt) - sourcePublishedAtMs) / 3_600_000;
  const deltaHours = Number(rawDeltaHours.toFixed(1));
  if (Math.abs(rawDeltaHours) > windowHours) {
    return { status:"outside_time_window" as const, message:`候选与原来源相差 ${deltaHours > 0 ? "+" : ""}${deltaHours} 小时，超过 ${windowHours} 小时时间窗；不会发送当前预览请求`, blocksPreview:true, deltaHours };
  }
  return { status:"within_time_window" as const, message:`候选与原来源相差 ${deltaHours > 0 ? "+" : ""}${deltaHours} 小时，符合 ${windowHours} 小时时间窗`, blocksPreview:false, deltaHours };
}

function assessBoundedText(value: string, minimum: number, maximum: number, label: string, collapseWhitespace = false) {
  const normalized = collapseWhitespace
    ? value.normalize("NFKC").replace(/\s+/g, " ").trim()
    : value.normalize("NFKC").trim();
  if (!normalized) return { status:"awaiting_text" as const, message:null, blocksPreview:false };
  if (normalized.length < minimum || normalized.length > maximum) {
    return { status:"invalid_text" as const, message:`${label}需为 ${minimum}–${maximum} 个字符；不会发送当前预览请求`, blocksPreview:true };
  }
  return { status:"valid" as const, message:null, blocksPreview:false };
}

function tokenizeNewsTitle(title: string) {
  const text = title.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[’']/g, "").replace(/[^\p{Letter}\p{Number}\p{Script=Han}]+/gu, " ").replace(/\s+/g, " ").trim();
  const tokens = new Set((text.match(/[a-z\p{Letter}\p{Number}]{2,}/gu) ?? [])
    .filter((token) => !/[\p{Script=Han}]/u.test(token))
    .filter((token) => !TITLE_STOP_WORDS.has(token)));
  for (const sequence of text.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    const characters = [...sequence];
    for (let index = 0; index < characters.length - 1; index += 1) tokens.add(characters.slice(index, index + 2).join(""));
  }
  return tokens;
}

export function assessManualEvidenceTitleMatch(targetTitle: string, candidateTitle: string, minimumSimilarity = DEFAULT_MINIMUM_TITLE_SIMILARITY, minimumSharedTerms = DEFAULT_MINIMUM_SHARED_TITLE_TERMS) {
  if (!targetTitle.trim() || !candidateTitle.trim()) return { status:"awaiting_titles" as const, message:null, blocksPreview:false, similarity:null, sharedTerms:[] as string[] };
  const targetTerms = tokenizeNewsTitle(targetTitle);
  const candidateTerms = tokenizeNewsTitle(candidateTitle);
  const sharedTerms = [...targetTerms].filter((term) => candidateTerms.has(term)).sort();
  const unionSize = new Set([...targetTerms, ...candidateTerms]).size;
  const similarity = unionSize ? Number((sharedTerms.length / unionSize).toFixed(4)) : 0;
  if (sharedTerms.length < minimumSharedTerms || similarity < minimumSimilarity) {
    return { status:"title_match_below_threshold" as const, message:`候选标题与待补证标题关联度不足（共同词项 ${sharedTerms.length}/${minimumSharedTerms}，相似度 ${similarity}/${minimumSimilarity}）；不会发送当前预览请求`, blocksPreview:true, similarity, sharedTerms };
  }
  return { status:"title_match_ready" as const, message:null, blocksPreview:false, similarity, sharedTerms };
}

export function assessManualEvidenceTextFields(sourceName: string, title: string, targetTitle = "") {
  const sourceNameAssessment = assessBoundedText(sourceName, 2, 80, "来源名称");
  const boundedTitleAssessment = assessBoundedText(title, 8, 300, "候选标题", true);
  const titleMatch = boundedTitleAssessment.status === "valid" ? assessManualEvidenceTitleMatch(targetTitle, title) : assessManualEvidenceTitleMatch("", "");
  const titleAssessment = titleMatch.blocksPreview
    ? { status:titleMatch.status, message:titleMatch.message, blocksPreview:true }
    : boundedTitleAssessment;
  return {
    sourceName:sourceNameAssessment,
    title:titleAssessment,
    titleMatch,
    blocksPreview:sourceNameAssessment.blocksPreview || titleAssessment.blocksPreview,
  };
}

export function describeManualEvidencePreviewReadiness(fieldsComplete: boolean, localValidationBlocked: boolean) {
  if (!fieldsComplete) return "缺少字段时不会发送预览请求";
  if (localValidationBlocked) return "字段已填齐，但本地校验已阻断；修正红色提示后才能预览";
  return "字段已填齐且本地校验通过；服务器仍会校验公开 HTTPS、同源、时间窗和标题关联";
}
