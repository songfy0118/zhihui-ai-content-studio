import { resolve } from "node:path";
import { inspectPackageReadiness } from "../bridge/package-readiness.mjs";

const manifestPath = resolve(process.argv[2] ?? "work/packages/octopus-pilot/manifest.json");
console.log(JSON.stringify(await inspectPackageReadiness(manifestPath), null, 2));
