#!/usr/bin/env tsx
import { Option, program } from "commander";
import { formatCopilotPreflightMarkdown, runCopilotPreflight } from "./preflight.js";

program
  .name("civ6-ai-copilot-preflight")
  .description("Check snapshot readiness before Agent analysis.")
  .option("--snapshot <path>", "Path to latest.json or another civ6-ai-copilot snapshot.")
  .option("--snapshot-dir <dir>", "Directory containing latest.json and optionally latest-manifest.json.")
  .option("--intent <intent>", "Stable analysis intent; repeat or comma-separate. Examples: turn-priority, war, policy, settling.", collectList, [])
  .option("--module <module>", "Explicit required briefing module; repeat or comma-separate.", collectList, [])
  .option("--note <text>", "Optional human-readable context copied into the report.")
  .addOption(new Option("--question <text>", "Legacy alias for --note.").hideHelp())
  .option("--max-age-minutes <minutes>", "Fail if snapshot.exportedAt is older than this many minutes; default is 30.", (value) =>
    Number.parseFloat(value)
  )
  .option("--format <format>", "Output format: markdown or json.", "markdown")
  .parse();

const options = program.opts<{
  snapshot?: string;
  snapshotDir?: string;
  intent: string[];
  module: string[];
  note?: string;
  question?: string;
  maxAgeMinutes?: number;
  format: string;
}>();

const report = await runCopilotPreflight({
  snapshotPath: options.snapshot,
  snapshotDir: options.snapshotDir,
  question: options.note ?? options.question,
  intents: options.intent,
  requiredModules: options.module,
  maxAgeMinutes: options.maxAgeMinutes
});

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatCopilotPreflightMarkdown(report));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

if (process.exitCode === undefined && report.exitCode !== 0) {
  process.exitCode = report.exitCode;
}

function collectList(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(",").map((item) => item.trim()).filter(Boolean)];
}
