type NewsSourceOptionInput = {
  id: string;
  name: string;
  baseUrl: string;
  sourceType: string;
  enabled: boolean;
  requiresLogin: boolean;
  feedUrl?: string | null;
  feedEvidenceUrl?: string | null;
  editorialAliases?: string[];
};

type ManualSourceNameSuggestion = {
  id: string;
  name: string;
  aliases: string[];
  expectedHost: string | null;
  expectedHosts: string[];
};

type ManualSourceLinkHostAssessment = {
  status: "unregistered" | "awaiting_link" | "invalid_link" | "unsafe_link" | "mismatch" | "match";
  message: string | null;
  blocksPreview: boolean;
};

function normalizedHost(value: string) {
  try {
    return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "").replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

function ipv4Octets(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function isPublicLookingHost(hostname: string | null) {
  if (!hostname || hostname === "localhost") return false;
  if (hostname.includes(":")) return !/^(::|::1|fc|fd|fe8|fe9|fea|feb|2001:db8)/i.test(hostname);
  if (!hostname.includes(".")) return false;
  if ([".localhost", ".local", ".internal", ".lan", ".home", ".test", ".example", ".invalid"].some((suffix) => hostname.endsWith(suffix))) return false;
  const octets = ipv4Octets(hostname);
  if (!octets) return true;
  const [a, b] = octets;
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)));
}

function normalizedSourceLabel(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function expectedHosts(source: NewsSourceOptionInput) {
  return [...new Set([source.baseUrl, source.feedEvidenceUrl, source.feedUrl]
    .filter((value): value is string => typeof value === "string")
    .map(normalizedHost)
    .filter((host): host is string => Boolean(host)))];
}

function toSuggestion(source: NewsSourceOptionInput): ManualSourceNameSuggestion {
  const hosts = expectedHosts(source);
  return {
    id: source.id,
    name: source.name,
    aliases: [...(source.editorialAliases ?? [])],
    expectedHost: normalizedHost(source.baseUrl),
    expectedHosts: hosts,
  };
}

export function listManualSourceNameSuggestions(sources: NewsSourceOptionInput[]) {
  return sources
    .filter((source) => source.sourceType === "manual_import" && !source.enabled && source.requiresLogin)
    .map(toSuggestion)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

export function listEvidenceHandoffSourceSuggestions(sources: NewsSourceOptionInput[]) {
  return sources
    .filter((source) => source.editorialAliases?.length && (
      (source.enabled && !source.requiresLogin)
      || (source.sourceType === "manual_import" && !source.enabled && source.requiresLogin)
    ))
    .map(toSuggestion)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

export function assessManualSourceLinkHost(sourceName: string, canonicalUrl: string, suggestions: ManualSourceNameSuggestion[]): ManualSourceLinkHostAssessment {
  const normalizedName = normalizedSourceLabel(sourceName);
  const selected = suggestions.find((source) => [source.name, ...source.aliases]
    .some((label) => normalizedSourceLabel(label) === normalizedName));
  if (!canonicalUrl.trim()) {
    return selected
      ? { status: "awaiting_link", message: `已选择“${selected.name}”；请粘贴该来源的公开文章链接`, blocksPreview: false }
      : { status: "unregistered", message: null, blocksPreview: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(canonicalUrl);
  } catch {
    return { status: "invalid_link", message: "链接格式无效；请填写完整的公开 HTTPS 链接", blocksPreview: true };
  }
  const currentHost = normalizedHost(parsed.href);
  if (parsed.protocol !== "https:" || !currentHost) {
    return { status: "invalid_link", message: "链接必须使用公开 HTTPS；不会发送当前预览请求", blocksPreview: true };
  }
  if (parsed.username || parsed.password) {
    return { status: "unsafe_link", message: "公开链接不能包含账号或密码；不会发送当前预览请求", blocksPreview: true };
  }
  if (!isPublicLookingHost(currentHost)) {
    return { status: "unsafe_link", message: `链接主机 ${currentHost} 不是可公开访问的互联网主机；不会发送当前预览请求`, blocksPreview: true };
  }
  if (!selected) return { status: "unregistered", message: null, blocksPreview: false };
  if (selected.expectedHosts.length && !selected.expectedHosts.includes(currentHost)) {
    return {
      status: "mismatch",
      message: `所选来源登记主机为 ${selected.expectedHosts.join(" / ")}，当前链接为 ${currentHost}；请核对来源名称或链接`,
      blocksPreview: true,
    };
  }
  return { status: "match", message: `链接主机与已登记来源一致（${currentHost}）；仍需人工核对标题和发布时间`, blocksPreview: false };
}

export function describeManualSourceLinkHost(sourceName: string, canonicalUrl: string, suggestions: ManualSourceNameSuggestion[]) {
  return assessManualSourceLinkHost(sourceName, canonicalUrl, suggestions).message;
}
