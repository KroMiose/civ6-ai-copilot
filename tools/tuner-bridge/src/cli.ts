#!/usr/bin/env tsx
import { program } from "commander";
import { TunerClient } from "./nexus-client.js";
import { runTunerBridgeOnce } from "./tuner-bridge.js";

program
  .name("civ6-ai-copilot-tuner-bridge")
  .description("Read the cached civ6-ai-copilot snapshot through the local Civ6 FireTuner/Nexus socket.")
  .requiredOption("-o, --output-dir <path>", "Directory where snapshots/latest.json will be written.")
  .option("--host <host>", "Tuner host.", "127.0.0.1")
  .option("--port <port>", "Specific tuner port; defaults to trying 4318 then 4319.", parsePort)
  .option("--state <name>", "Lua state to read from; defaults to InGame when available.")
  .option("--timeout-ms <ms>", "Socket read/write timeout.", parsePositiveInteger, 8000)
  .option("--allow-invalid", "Write the snapshot even when schema/fairness validation fails.", false)
  .option("--diagnose-only", "Only read and diagnose the cached export.", false)
  .option("--list-states", "List available Lua states and exit.", false)
  .parse();

const options = program.opts<{
  outputDir: string;
  host: string;
  port?: number;
  state?: string;
  timeoutMs: number;
  allowInvalid: boolean;
  diagnoseOnly: boolean;
  listStates: boolean;
}>();

if (options.listStates) {
  const client = await TunerClient.connect({
    host: options.host,
    ports: options.port ? [options.port] : undefined,
    timeoutMs: options.timeoutMs,
    appName: "civ6-ai-copilot"
  });
  try {
    console.log(
      JSON.stringify(
        {
          tuner: client.info(),
          states: [...client.states.entries()].map(([name, index]) => ({ name, index }))
        },
        null,
        2
      )
    );
  } finally {
    client.close();
  }
} else {
  const result = await runTunerBridgeOnce({
    outputDir: options.outputDir,
    host: options.host,
    ports: options.port ? [options.port] : undefined,
    state: options.state,
    timeoutMs: options.timeoutMs,
    allowInvalid: options.allowInvalid,
    diagnoseOnly: options.diagnoseOnly
  });
  const output = JSON.stringify(result, null, 2);
  if (result.ok) {
    console.log(output);
  } else {
    console.error(output);
    process.exitCode = result.exitCode;
  }
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }
  return port;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("value must be a positive integer");
  }
  return parsed;
}
