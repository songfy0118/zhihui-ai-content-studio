import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { classifyArtifactForProduction, validateProductionReadiness } from "./production-readiness.mjs";
import { PLATFORM_REQUIREMENTS, validatePlatformPackages } from "./platform-package-policy.mjs";

export async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((resolveStream, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolveStream);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

export async function inspectPackageReadiness(manifestPath) {
  const resolvedManifest = resolve(manifestPath);
  const packageRoot = dirname(resolvedManifest);
  const manifest = JSON.parse(await readFile(resolvedManifest, "utf8"));
  const artifactChecks = await Promise.all((manifest.artifacts ?? []).map(async (artifact) => {
    const productionPolicy = classifyArtifactForProduction(artifact);
    const target = resolve(packageRoot, artifact.file ?? "");
    const insidePackage = !isAbsolute(artifact.file ?? "") && !relative(packageRoot, target).startsWith("..");
    if (!insidePackage) return { kind: artifact.kind, file: artifact.file, verified: false, ...productionPolicy, reason: "outside_package" };
    if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? "")) return { kind: artifact.kind, file: artifact.file, verified: false, ...productionPolicy, reason: "invalid_sha256" };
    try {
      return { kind: artifact.kind, file: artifact.file, verified: await sha256(target) === artifact.sha256.toLowerCase(), ...productionPolicy };
    } catch {
      return { kind: artifact.kind, file: artifact.file, verified: false, ...productionPolicy, reason: "file_unavailable" };
    }
  }));
  const platformCopies = {};
  const platformFiles = await Promise.all(Object.keys(PLATFORM_REQUIREMENTS).map(async (platform) => {
    const file = manifest?.platform_packages?.[platform]?.file;
    const target = resolve(packageRoot, file ?? "");
    const insidePackage = typeof file === "string" && !isAbsolute(file) && !relative(packageRoot, target).startsWith("..");
    if (!insidePackage) return { platform, file, verified: false, reason: "outside_or_missing_package_file" };
    try {
      platformCopies[platform] = JSON.parse(await readFile(target, "utf8"));
      return { platform, file, verified: true, reason: null };
    } catch {
      return { platform, file, verified: false, reason: "package_file_unavailable" };
    }
  }));
  const platformPolicy = validatePlatformPackages(platformCopies);
  const platformPackageEvidence = { ...platformPolicy, files: platformFiles, ready: platformPolicy.ready && platformFiles.every((file) => file.verified) };
  return { manifest: resolvedManifest, projectId: manifest.project_id, mediaStatus: manifest.media_status, artifactChecks, platformPackageEvidence, ...validateProductionReadiness(manifest, artifactChecks, platformPackageEvidence) };
}
