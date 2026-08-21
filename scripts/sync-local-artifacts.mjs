import { resolve } from "node:path";
import { inspectLocalMiniDramaOutputs } from "../bridge/local-mini-drama-artifacts.mjs";
import { inspectPackageReadiness } from "../bridge/package-readiness.mjs";
import { registerLocalMiniDramaArtifacts } from "../bridge/register-local-artifacts.mjs";

const manifestPath = resolve(process.argv[2] ?? "work/packages/octopus-pilot/manifest.json");
const packageReadiness = await inspectPackageReadiness(manifestPath);
const engineOutputs = await inspectLocalMiniDramaOutputs("http://127.0.0.1:5679/api/v1", packageReadiness.projectId);
const result = await registerLocalMiniDramaArtifacts({
  manifestPath,
  engineOutputs,
  storageRoots: [resolve("vendor/LocalMiniDrama/backend-node/data/storage")],
});

console.log(JSON.stringify({ engineOutputs, ...result }, null, 2));
