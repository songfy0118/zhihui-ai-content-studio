import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const SENSITIVE_FILENAMES = [
  { ruleId: "sensitive_env_file", pattern: /(^|\/)\.env(?:\..+)?$/i },
  { ruleId: "cloudflare_dev_vars", pattern: /(^|\/)\.dev\.vars(?:\..+)?$/i },
  { ruleId: "private_key_file", pattern: /\.(?:pem|key)$/i },
];

const SECRET_ASSIGNMENTS = [
  {
    ruleId: "api_key_assignment",
    pattern: /^\s*(?:export\s+)?(?:DASHSCOPE_API_KEY|OPENAI_API_KEY|KLING_(?:ACCESS|SECRET)_KEY|VIDU_API_KEY|MULE(?:ROUTER)?_API_KEY|ALIBABA_CLOUD_ACCESS_KEY_(?:ID|SECRET))\s*[=:]\s*["']?([^"'\s,}]+)/i,
  },
  {
    ruleId: "json_secret_assignment",
    pattern: /^\s*["'](?:api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret)["']\s*:\s*["']([^"']+)["']/i,
  },
];

const SAFE_PLACEHOLDERS = /^(?:|changeme|example|placeholder|replace[_-]?me|your[_-].+|<.+>|\$\{.+\})$/i;
const TEXT_EXTENSIONS = new Set(["", ".cjs", ".css", ".env", ".example", ".js", ".json", ".jsx", ".md", ".mjs", ".mts", ".ps1", ".py", ".sh", ".sql", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);

export function classifySensitivePath(file) {
  const normalized = file.replaceAll("\\", "/");
  if (/(^|\/)\.env\.example$/i.test(normalized)) return null;
  return SENSITIVE_FILENAMES.find(({ pattern }) => pattern.test(normalized))?.ruleId ?? null;
}

export function findSecretAssignments(text) {
  const findings = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    for (const { ruleId, pattern } of SECRET_ASSIGNMENTS) {
      const match = line.match(pattern);
      if (!match || SAFE_PLACEHOLDERS.test(match[1]?.trim() ?? "")) continue;
      findings.push({ ruleId, line: index + 1 });
    }
  }
  return findings;
}

export async function inspectSecretBoundary(root, files) {
  const blockedFiles = [];
  const suspiciousAssignments = [];
  let trackedFilesChecked = 0;

  for (const file of files) {
    const normalized = file.replaceAll("\\", "/");
    const pathRule = classifySensitivePath(normalized);
    if (pathRule) blockedFiles.push({ file: normalized, ruleId: pathRule });
    if (!TEXT_EXTENSIONS.has(extname(normalized).toLowerCase())) continue;

    let content;
    try {
      content = await readFile(new URL(normalized, root), "utf8");
    } catch {
      continue;
    }
    trackedFilesChecked += 1;
    for (const finding of findSecretAssignments(content)) {
      suspiciousAssignments.push({ file: normalized, ...finding });
    }
  }

  return {
    safe: blockedFiles.length === 0 && suspiciousAssignments.length === 0,
    trackedFilesChecked,
    blockedFiles,
    suspiciousAssignments,
    secretsPrinted: false,
  };
}
