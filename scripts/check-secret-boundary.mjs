import { execFileSync } from "node:child_process";
import { inspectSecretBoundary } from "../bridge/secret-boundary.mjs";

const root = new URL("../", import.meta.url);
const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
});
const files = output.split("\0").filter(Boolean);
const result = await inspectSecretBoundary(root, files);

console.log(JSON.stringify(result, null, 2));
if (!result.safe) process.exitCode = 1;
