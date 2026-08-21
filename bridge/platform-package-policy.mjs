export const PLATFORM_REQUIREMENTS = Object.freeze({
  douyin: { language: "zh-CN" },
  tiktok: { language: "en-US" },
  xiaohongshu: { language: "zh-CN" },
});

const PERFORMANCE_PROMISE = /(?:必爆|爆款保证|保证(?:播放|流量|涨粉)|百万播放|稳赚|guaranteed\s+(?:viral|views?)|(?:100k|1m)\s+views?)/i;

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validatePlatformPackages(packages = {}) {
  const perPlatform = Object.entries(PLATFORM_REQUIREMENTS).map(([platform, requirement]) => {
    const copy = packages?.[platform];
    const blockers = [];
    if (!copy || typeof copy !== "object") return { platform, ready: false, blockers: ["package_missing"] };
    if (!hasText(copy.title)) blockers.push("title_missing");
    if (!hasText(copy.caption)) blockers.push("caption_missing");
    if (!hasText(copy.cover_text)) blockers.push("cover_text_missing");
    if (copy.language !== requirement.language) blockers.push("language_mismatch");
    if (!hasText(copy.source_note)) blockers.push("source_note_missing");
    const hashtags = Array.isArray(copy.hashtags) ? copy.hashtags.filter(hasText) : [];
    if (hashtags.length < 2 || hashtags.length > 8) blockers.push("hashtag_count");
    if (new Set(hashtags.map((tag) => tag.trim().toLowerCase())).size !== hashtags.length) blockers.push("duplicate_hashtags");
    if (PERFORMANCE_PROMISE.test([copy.title, copy.caption, copy.cover_text].join(" "))) blockers.push("performance_promise");
    return { platform, ready: blockers.length === 0, blockers };
  });
  const titles = Object.values(packages).map((copy) => String(copy?.title ?? "").trim().toLowerCase()).filter(Boolean);
  const distinctTitles = new Set(titles).size === Object.keys(PLATFORM_REQUIREMENTS).length;
  const blockers = perPlatform.flatMap((item) => item.blockers.map((blocker) => `${item.platform}:${blocker}`));
  if (!distinctTitles) blockers.push("platform_titles_not_distinct");
  return {
    ready: blockers.length === 0,
    blockers,
    perPlatform,
    packageCount: perPlatform.filter((item) => item.ready).length,
    requiredCount: Object.keys(PLATFORM_REQUIREMENTS).length,
    performancePromiseDetected: blockers.some((blocker) => blocker.endsWith(":performance_promise")),
  };
}
