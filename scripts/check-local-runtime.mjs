import { inspectLocalRuntime } from "../bridge/local-runtime-doctor.mjs";

const result = await inspectLocalRuntime();
console.log(JSON.stringify(result, null, 2));
if (!result.current) process.exitCode = 1;
