import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = new URL("../", import.meta.url).pathname.replace(/^\/(.:)/, "$1");

async function readPlan() {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/prepare-cosyvoice.ps1"],
    { cwd: projectRoot, timeout: 15000, windowsHide: true },
  );
  return JSON.parse(stdout);
}

const [plan, repeatedPlan, source] = await Promise.all([
  readPlan(),
  readPlan(),
  readFile(new URL("./prepare-cosyvoice.ps1", import.meta.url), "utf8"),
]);
assert.equal(plan.mode, "plan_only");
assert.equal(plan.mutationPerformed, false);
assert.equal(plan.executeRequested, false);
assert.equal(plan.modelDownloadConfirmed, false);
assert.equal(plan.approvalRequired, true);
assert.equal(plan.downloadTriggered, false);
assert.equal(plan.environmentName, "zhihui-cosyvoice");
assert.equal(plan.modelId, "iic/CosyVoice2-0.5B");
assert.equal(plan.stages.length, 4);
assert.ok(plan.modelFilesMissing.includes("cosyvoice2.yaml") || plan.modelPresent);
assert.equal(repeatedPlan.mutationPerformed, false);
assert.equal(repeatedPlan.environmentPresent, plan.environmentPresent);
assert.equal(repeatedPlan.modelPresent, plan.modelPresent);
assert.deepEqual(repeatedPlan.modelFilesMissing, plan.modelFilesMissing);
const confirmationGate = source.indexOf("if (-not $ConfirmModelDownload)");
const environmentCreation = source.indexOf("& conda create");
const modelDownload = source.indexOf("snapshot_download('iic/CosyVoice2-0.5B'");
assert.ok(confirmationGate >= 0 && confirmationGate < environmentCreation && environmentCreation < modelDownload);
console.log(JSON.stringify({ mode: plan.mode, mutationPerformed: plan.mutationPerformed, approvalRequired: plan.approvalRequired, environmentPresent: plan.environmentPresent, modelPresent: plan.modelPresent }));
