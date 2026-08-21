function classifyStatus(status) {
  if (status >= 200 && status < 400) return "available";
  if ([401, 403, 429].includes(status)) return "access_restricted";
  return "unavailable";
}

async function requestHeaders(url, fetcher, timeoutMs) {
  try {
    const head = await fetcher(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "ZhihuiSourceAvailability/1.0" },
    });
    if (![405, 501].includes(head.status)) return { response: head, method: "HEAD" };
  } catch {}
  const ranged = await fetcher(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Range: "bytes=0-0", "User-Agent": "ZhihuiSourceAvailability/1.0" },
  });
  await ranged.body?.cancel();
  return { response: ranged, method: "GET_RANGE" };
}

export async function checkSourceAvailability(sources, { fetcher = fetch, timeoutMs = 8000 } = {}) {
  const limitedSources = Array.isArray(sources) ? sources.slice(0, 20) : [];
  const results = await Promise.all(limitedSources.map(async (source) => {
    let parsed;
    try {
      parsed = new URL(source);
      if (parsed.protocol !== "https:") throw new Error("unsupported_protocol");
    } catch {
      return { source, hostname: null, status: null, availability: "invalid_url", method: null, bodyRead: false };
    }

    try {
      const { response, method } = await requestHeaders(parsed.href, fetcher, timeoutMs);
      return {
        source: parsed.href,
        hostname: parsed.hostname,
        finalHostname: new URL(response.url || parsed.href).hostname,
        status: response.status,
        availability: classifyStatus(response.status),
        method,
        bodyRead: false,
      };
    } catch (error) {
      return {
        source: parsed.href,
        hostname: parsed.hostname,
        status: null,
        availability: error?.name === "TimeoutError" ? "timeout" : "network_error",
        method: null,
        bodyRead: false,
      };
    }
  }));

  return {
    checked: results.length,
    available: results.filter((result) => result.availability === "available").length,
    restricted: results.filter((result) => result.availability === "access_restricted").length,
    unavailable: results.filter((result) => !["available", "access_restricted"].includes(result.availability)).length,
    results,
    automatic: false,
    contentRead: false,
    factCorrectnessAssessed: false,
  };
}
