const DEFAULT_USER_AGENT_TOKEN = "ZhihuiResearchBot";
const DEFAULT_MAX_BYTES = 500_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function parseGroups(robotsText) {
  const groups = [];
  let agents = [];
  let rules = [];
  let hasRules = false;
  const flush = () => {
    if (agents.length) groups.push({ agents: [...new Set(agents)], rules });
    agents = [];
    rules = [];
    hasRules = false;
  };

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const directive = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (directive === "user-agent") {
      if (hasRules) flush();
      if (value) agents.push(value.toLowerCase());
      continue;
    }
    if ((directive === "allow" || directive === "disallow") && agents.length) {
      hasRules = true;
      if (value || directive === "allow") rules.push({ directive, path: value });
    }
  }
  flush();
  return groups;
}

function matchingGroups(groups, userAgentToken) {
  const userAgent = userAgentToken.toLowerCase();
  const specific = groups.flatMap((group) => group.agents
    .filter((agent) => agent !== "*" && userAgent.includes(agent))
    .map((agent) => ({ group, agentLength: agent.length })));
  if (specific.length) {
    const longest = Math.max(...specific.map((match) => match.agentLength));
    return specific.filter((match) => match.agentLength === longest).map((match) => match.group);
  }
  return groups.filter((group) => group.agents.includes("*"));
}

function ruleMatches(pathAndQuery, rulePath) {
  if (!rulePath) return false;
  const anchored = rulePath.endsWith("$");
  const pattern = anchored ? rulePath.slice(0, -1) : rulePath;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(pathAndQuery);
}

export function evaluateRobotsTxt(robotsText, { url, userAgentToken = DEFAULT_USER_AGENT_TOKEN } = {}) {
  if (typeof robotsText !== "string") return { checked: false, allowed: false, reason: "robots_text_invalid", matchedRule: null };
  let articleUrl;
  try {
    articleUrl = new URL(url);
  } catch {
    return { checked: false, allowed: false, reason: "article_url_invalid", matchedRule: null };
  }
  const groups = matchingGroups(parseGroups(robotsText), userAgentToken);
  const pathAndQuery = `${articleUrl.pathname}${articleUrl.search}`;
  const matches = groups.flatMap((group) => group.rules.filter((rule) => ruleMatches(pathAndQuery, rule.path)));
  if (!matches.length) return { checked: true, allowed: true, reason: "no_matching_rule", matchedRule: null };
  matches.sort((left, right) => right.path.length - left.path.length || Number(right.directive === "allow") - Number(left.directive === "allow"));
  const winner = matches[0];
  return {
    checked: true,
    allowed: winner.directive === "allow",
    reason: winner.directive === "allow" ? "allowed_by_rule" : "disallowed_by_rule",
    matchedRule: { directive: winner.directive, path: winner.path },
  };
}

function withinHost(urlValue, configuredHost) {
  try {
    const url = new URL(urlValue);
    return url.protocol === "https:" && (url.hostname === configuredHost || url.hostname.endsWith(`.${configuredHost}`));
  } catch {
    return false;
  }
}

function result(fields = {}) {
  return {
    checked: false,
    allowed: false,
    reason: "robots_check_failed",
    matchedRule: null,
    requestsMade: 0,
    robotsTextPersisted: false,
    ...fields,
  };
}

export function createRobotsPolicyChecker({
  fetcher,
  userAgentToken = DEFAULT_USER_AGENT_TOKEN,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
} = {}) {
  if (typeof fetcher !== "function") throw new Error("robots_fetcher_required");
  if (typeof userAgentToken !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(userAgentToken)) throw new Error("robots_user_agent_token_invalid");

  return async ({ url, configuredHost } = {}) => {
    if (!withinHost(url, configuredHost)) return result({ reason: "article_url_outside_configured_host" });
    const articleUrl = new URL(url);
    let robotsUrl = `${articleUrl.origin}/robots.txt`;
    let requestsMade = 0;

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      let response;
      try {
        response = await fetcher(robotsUrl, {
          method: "GET",
          headers: { Accept: "text/plain", "User-Agent": userAgentToken },
          credentials: "omit",
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        requestsMade += 1;
      } catch (error) {
        return result({ reason: error?.name === "TimeoutError" ? "robots_timeout" : "robots_fetch_failed", requestsMade });
      }
      if (!response || typeof response.status !== "number" || typeof response.headers?.get !== "function" || typeof response.text !== "function") return result({ reason: "robots_response_invalid", requestsMade });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) return result({ reason: "robots_redirect_location_missing", requestsMade });
        if (redirectCount >= maxRedirects) return result({ reason: "robots_redirect_limit_exceeded", requestsMade });
        let nextUrl;
        try {
          nextUrl = new URL(location, robotsUrl).toString();
        } catch {
          return result({ reason: "robots_redirect_location_invalid", requestsMade });
        }
        if (!withinHost(nextUrl, configuredHost)) return result({ reason: "robots_redirect_outside_configured_host", requestsMade });
        robotsUrl = nextUrl;
        continue;
      }

      if (response.status === 404 || response.status === 410) return result({ checked: true, allowed: true, reason: "robots_not_present", requestsMade });
      if (response.status === 401 || response.status === 403) return result({ checked: true, reason: "robots_access_denied", requestsMade });
      if (response.status === 429) return result({ checked: true, reason: "robots_rate_limited", requestsMade });
      if (response.status < 200 || response.status >= 300) return result({ checked: true, reason: `robots_http_${response.status}`, requestsMade });

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType && !contentType.includes("text/plain")) return result({ checked: true, reason: "robots_content_type_invalid", requestsMade });
      const reportedBytes = Number(response.headers.get("content-length") ?? 0);
      if (reportedBytes > maxBytes) return result({ checked: true, reason: "robots_too_large", requestsMade });
      let robotsText;
      try {
        robotsText = await response.text();
      } catch {
        return result({ checked: true, reason: "robots_body_read_failed", requestsMade });
      }
      if (new TextEncoder().encode(robotsText).byteLength > maxBytes) return result({ checked: true, reason: "robots_too_large", requestsMade });
      return { ...result({ requestsMade }), ...evaluateRobotsTxt(robotsText, { url, userAgentToken }), requestsMade, robotsTextPersisted: false };
    }
    return result({ reason: "robots_redirect_limit_exceeded", requestsMade });
  };
}
