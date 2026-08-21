const endpoint = process.env.ZHIHUI_STUDIO_URL ?? "http://127.0.0.1:3000";
const migrationTag = "0003_faithful_harry_osborn";
const confirmation = "APPLY_RECEIPT_MIGRATION_LOCALLY";
const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const tagConfirmed = args.has(`--confirm-tag=${migrationTag}`);
const localD1Confirmed = args.has(`--confirm-local-d1=${confirmation}`);

if (execute && (!tagConfirmed || !localD1Confirmed)) {
  console.error(JSON.stringify({ mode: "blocked", applyPerformed: false, databaseWrites: false, blockers: ["exact_migration_confirmation_required"] }, null, 2));
  process.exitCode = 2;
} else {
  const response = await fetch(`${endpoint}/api/local/receipt-migration`, {
    method: execute ? "POST" : "GET",
    headers: execute ? { "content-type": "application/json" } : undefined,
    body: execute ? JSON.stringify({ migrationTag, confirmation }) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  console.log(JSON.stringify({ requestedMode: execute ? "execute" : "plan_only", ...result }, null, 2));
  if (!response.ok) process.exitCode = 2;
}
