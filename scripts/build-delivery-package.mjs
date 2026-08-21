import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateFactReview } from "../bridge/fact-review-policy.mjs";
import { PLATFORM_REQUIREMENTS, validatePlatformPackages } from "../bridge/platform-package-policy.mjs";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
const inputPath = resolve(positionalArgs[0] ?? "examples/octopus-pilot.json");
const outputRoot = resolve(positionalArgs[1] ?? "work/packages/octopus-pilot");
const pilot = JSON.parse(await readFile(inputPath, "utf8"));

function srtTime(totalSeconds) {
  const milliseconds = Math.round(totalSeconds * 1000);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function spokenLines(storyboard) {
  return [storyboard.narration, storyboard.dialogue]
    .filter(Boolean)
    .flatMap((text) => String(text).split(/\n+/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildSubtitleDraft(storyboards) {
  const entries = [];
  let cursor = 0;
  for (const storyboard of storyboards) {
    const duration = Math.max(1, Number(storyboard.duration) || 1);
    const lines = spokenLines(storyboard);
    if (lines.length === 0) {
      cursor += duration;
      continue;
    }
    const perLine = duration / lines.length;
    for (const line of lines) {
      const start = cursor;
      cursor += perLine;
      entries.push({ start, end: cursor, text: line });
    }
  }
  return entries.map((entry, index) =>
    `${index + 1}\n${srtTime(entry.start)} --> ${srtTime(entry.end)}\n${entry.text}\n`,
  ).join("\n");
}

const factReviewEvidence = validateFactReview(pilot.outline?.metadata?.fact_review);
if (!factReviewEvidence.ready) throw new Error(`Fact review must be completed before packaging: ${factReviewEvidence.blockers.join(", ")}`);
if (!Array.isArray(pilot.storyboards) || pilot.storyboards.length === 0) {
  throw new Error("At least one storyboard is required");
}
const platformPackageEvidence = validatePlatformPackages(pilot.platform_copy);
if (!platformPackageEvidence.ready) throw new Error(`Douyin, TikTok, and Xiaohongshu copy are required: ${platformPackageEvidence.blockers.join(", ")}`);

await mkdir(outputRoot, { recursive: true });
const subtitlePath = resolve(outputRoot, "subtitles.zh-CN.draft.srt");
await writeFile(subtitlePath, buildSubtitleDraft(pilot.storyboards), "utf8");

for (const [platform, copy] of Object.entries(pilot.platform_copy)) {
  await writeFile(resolve(outputRoot, `${platform}.json`), JSON.stringify({
    ...copy,
    ai_disclosure: platform === "tiktok" ? "AI-assisted visuals and voice" : "本视频含AI辅助生成画面与配音",
    publish_status: "human_review_required",
  }, null, 2), "utf8");
}

const durationSeconds = pilot.storyboards.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
const manifest = {
  package_version: 1,
  project_id: pilot.drama_id,
  generated_at: new Date().toISOString(),
  status: "draft_ready",
  duration_seconds: durationSeconds,
  aspect_ratio: pilot.outline.metadata.aspect_ratio,
  platforms: Object.keys(pilot.platform_copy),
  platform_packages: Object.fromEntries(Object.entries(PLATFORM_REQUIREMENTS).map(([platform, requirement]) => [platform, { file: `${platform}.json`, language: requirement.language }])),
  subtitle_file: "subtitles.zh-CN.draft.srt",
  media_status: "waiting_for_generation",
  artifacts: [],
  fact_review: pilot.outline.metadata.fact_review,
  requires_human_review: true,
};
await writeFile(resolve(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

if (!offline) {
  const apiBase = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679/api/v1";
  const response = await fetch(`${apiBase}/dramas/${pilot.drama_id}/outline`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...pilot.outline,
      metadata: {
        ...pilot.outline.metadata,
        delivery_package: {
          status: manifest.status,
          path: outputRoot,
          platforms: manifest.platforms,
          duration_seconds: durationSeconds,
          requires_human_review: true,
        },
      },
    }),
  });
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message ?? "Failed to update LocalMiniDrama project metadata");
  }
}

console.log(JSON.stringify({ output: outputRoot, ...manifest }, null, 2));
