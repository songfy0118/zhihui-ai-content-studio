import { readFile } from "node:fs/promises";

import { buildSourceLockedScriptEnvelope } from "../bridge/source-locked-script-envelope.mjs";
import { buildSourceLockedScriptPlan, summarizeSourceLockedScriptPlan } from "../bridge/source-locked-script-plan.mjs";

const pilot = JSON.parse(await readFile(new URL("../examples/octopus-pilot.json", import.meta.url), "utf8"));
const outline = pilot.outline ?? {};
const envelope = buildSourceLockedScriptEnvelope({
  idea: { title: outline.title, angle: outline.summary },
  factReview: outline.metadata?.fact_review,
  targets: outline.metadata?.target_platforms,
});
const plan = buildSourceLockedScriptPlan({ envelope });

console.log(JSON.stringify(summarizeSourceLockedScriptPlan(plan), null, 2));
if (!plan.ready) process.exitCode = 1;
