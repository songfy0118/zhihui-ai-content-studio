type NewsSourceOptionInput = {
  id: string;
  name: string;
  baseUrl: string;
  sourceType: string;
  enabled: boolean;
  requiresLogin: boolean;
  editorialAliases?: string[];
};

type ManualSourceNameSuggestion = {
  id: string;
  name: string;
  aliases: string[];
  expectedHost: string | null;
};

function normalizedHost(value: string) {
  try {
    return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function listManualSourceNameSuggestions(sources: NewsSourceOptionInput[]) {
  return sources
    .filter((source) => source.sourceType === "manual_import" && !source.enabled && source.requiresLogin)
    .map((source) => ({
      id: source.id,
      name: source.name,
      aliases: [...(source.editorialAliases ?? [])],
      expectedHost: normalizedHost(source.baseUrl),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

export function listEvidenceHandoffSourceSuggestions(sources: NewsSourceOptionInput[]) {
  return sources
    .filter((source) => source.editorialAliases?.length && (
      (source.enabled && !source.requiresLogin)
      || (source.sourceType === "manual_import" && !source.enabled && source.requiresLogin)
    ))
    .map((source) => ({
      id: source.id,
      name: source.name,
      aliases: [...(source.editorialAliases ?? [])],
      expectedHost: normalizedHost(source.baseUrl),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

export function describeManualSourceLinkHost(sourceName: string, canonicalUrl: string, suggestions: ManualSourceNameSuggestion[]) {
  const selected = suggestions.find((source) => source.name === sourceName);
  if (!selected) return null;
  if (!canonicalUrl.trim()) return `已选择“${selected.name}”；请粘贴该来源的公开文章链接`;

  let parsed: URL;
  try {
    parsed = new URL(canonicalUrl);
  } catch {
    return "链接格式尚不完整；服务器预览会继续执行公开 HTTPS 校验";
  }
  const currentHost = normalizedHost(parsed.href);
  if (parsed.protocol !== "https:" || !currentHost) return "链接必须使用公开 HTTPS；服务器预览不会请求不安全地址";
  if (selected.expectedHost && currentHost !== selected.expectedHost) {
    return `所选来源登记主机为 ${selected.expectedHost}，当前链接为 ${currentHost}；请核对来源名称或链接`;
  }
  return `链接主机与已登记来源一致（${currentHost}）；仍需人工核对标题和发布时间`;
}
