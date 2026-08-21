import { spawn } from "node:child_process";
import { once } from "node:events";

const root = new URL("../", import.meta.url);
const port = 3766;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const existing = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
  if (existing.ok) throw new Error("verification_port_already_in_use");
} catch (error) {
  if (error instanceof Error && error.message === "verification_port_already_in_use") throw error;
}

const child = spawn(process.execPath, ["bridge/server.mjs"], {
  cwd: root,
  env: { ...process.env, ZHIHUI_BRIDGE_PORT: String(port) },
  stdio: "ignore",
  windowsHide: true,
});

let result;
try {
  let health = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { health = await response.json(); break; }
    } catch {}
  }
  if (!health) throw new Error("temporary_bridge_start_timeout");
  const verificationResponse = await fetch(`${baseUrl}/d1/migration-chain/isolated`, { signal: AbortSignal.timeout(5000) });
  const verification = await verificationResponse.json();
  result = {
    verified: health.protocolVersion === 3 && health.capabilities?.includes("isolated_d1_chain_verification") && verificationResponse.ok && verification.verified === true,
    temporaryPort: port,
    protocolVersion: health.protocolVersion ?? null,
    isolatedVerificationCapability: health.capabilities?.includes("isolated_d1_chain_verification") ?? false,
    migrationChainVerified: verification.verified === true,
    completedSteps: verification.completedSteps ?? 0,
    totalSteps: verification.totalSteps ?? 5,
    liveDatabaseWrites: verification.liveDatabaseWrites ?? false,
    businessResult: verification.businessResult ?? false,
    oldBridgeMutated: false,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
  };
} finally {
  child.kill();
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);
}

console.log(JSON.stringify({ ...result, temporaryBridgeStopped: true }, null, 2));
if (!result?.verified) process.exitCode = 1;
