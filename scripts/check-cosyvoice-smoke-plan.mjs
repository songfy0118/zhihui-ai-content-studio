import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = new URL("../", import.meta.url).pathname.replace(/^\/(.:)/, "$1");

async function readPlan() {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/verify-cosyvoice-smoke.ps1"],
    { cwd: projectRoot, timeout: 15000, windowsHide: true },
  );
  return JSON.parse(stdout);
}

const [plan, repeatedPlan, powershellSource, pythonSource] = await Promise.all([
  readPlan(),
  readPlan(),
  readFile(new URL("./verify-cosyvoice-smoke.ps1", import.meta.url), "utf8"),
  readFile(new URL("./cosyvoice-smoke.py", import.meta.url), "utf8"),
]);

assert.equal(plan.mode, "plan_only");
assert.equal(plan.mutationPerformed, false);
assert.equal(plan.executeRequested, false);
assert.equal(plan.smokeTriggered, false);
assert.equal(plan.resultType, "smoke_test");
assert.equal(plan.businessEvidence, false);
assert.equal(plan.publishable, false);
assert.equal(repeatedPlan.environmentPresent, plan.environmentPresent);
assert.equal(repeatedPlan.modelPresent, plan.modelPresent);
assert.deepEqual(repeatedPlan.missingModelFiles, plan.missingModelFiles);
const planExit = powershellSource.indexOf("if (-not $Execute)");
const inferenceCall = powershellSource.indexOf("& conda run -n $EnvironmentName python $SmokeScript");
assert.ok(planExit >= 0 && planExit < inferenceCall);
assert.match(pythonSource, /resultType.*smoke_test/s);
assert.match(pythonSource, /businessEvidence.*False/s);
assert.match(pythonSource, /publishable.*False/s);
console.log(JSON.stringify({ mode: plan.mode, mutationPerformed: plan.mutationPerformed, readyToExecute: plan.readyToExecute, blockers: plan.blockers }));
