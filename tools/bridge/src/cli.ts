#!/usr/bin/env tsx
import { program } from "commander";
import { runBridgeOnce, watchBridge } from "./bridge.js";

program
  .name("civ6-ai-copilot-bridge")
  .description("Rebuild a civ6-ai-copilot player-visible snapshot from Lua.log chunk output.")
  .requiredOption("-i, --input-log <path>", "Path to Lua.log or a captured fake Lua.log.")
  .requiredOption("-o, --output-dir <path>", "Directory where snapshots/latest.json will be written.")
  .option("--allow-invalid", "Write the snapshot even when schema/fairness validation fails.", false)
  .option("--diagnose-only", "Only scan Lua.log and report civ6-ai-copilot load/export diagnostics.", false)
  .option("--watch", "Keep polling Lua.log and write each new complete export.", false)
  .option("--interval-ms <ms>", "Polling interval for --watch.", (value) => Number.parseInt(value, 10), 2000)
  .parse();

const options = program.opts<{
  inputLog: string;
  outputDir: string;
  allowInvalid: boolean;
  diagnoseOnly: boolean;
  watch: boolean;
  intervalMs: number;
}>();

if (!Number.isFinite(options.intervalMs) || options.intervalMs < 250) {
  program.error("--interval-ms must be a number >= 250");
}

if (options.watch) {
  console.log(
    JSON.stringify({
      event: "watch-start",
      inputLog: options.inputLog,
      outputDir: options.outputDir,
      intervalMs: options.intervalMs
    })
  );
  await watchBridge({
    inputLog: options.inputLog,
    outputDir: options.outputDir,
    allowInvalid: options.allowInvalid,
    diagnoseOnly: options.diagnoseOnly,
    intervalMs: options.intervalMs,
    onResult: (result) => {
      if ("skipped" in result && result.skipped) {
        return;
      }
      console.log(JSON.stringify(result));
    }
  });
} else {
  const result = await runBridgeOnce(options);
  const output = JSON.stringify(result, null, 2);
  if (result.ok) {
    console.log(output);
  } else {
    console.error(output);
    process.exitCode = result.exitCode;
  }
}
