import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkSourceAvailability } from "../bridge/source-availability.mjs";

const manifestPath = resolve(process.argv[2] ?? "work/packages/octopus-pilot/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const result = await checkSourceAvailability(manifest?.fact_review?.sources);

console.log(JSON.stringify({ manifest: manifestPath, ...result }, null, 2));
