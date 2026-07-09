#!/usr/bin/env tsx
import { Option, program } from "commander";
import { formatCopilotHandoffMarkdown, runCopilotHandoff } from "./handoff.js";

program
  .name("civ6-ai-copilot-handoff")
  .description("Create a Windows-to-Mac Agent handoff folder from a civ6-ai-copilot snapshot.")
  .option("--snapshot <path>", "Path to latest.json or another civ6-ai-copilot snapshot.")
  .option("--snapshot-dir <dir>", "Directory containing latest.json and optionally latest-manifest.json.")
  .requiredOption("--output-dir <dir>", "Directory to write copilot-handoff.md and copied handoff files.")
  .option("--intent <intent>", "Stable analysis intent; repeat or comma-separate. Examples: turn-priority, war, policy, settling.", collectList, [])
  .option("--module <module>", "Explicit required briefing module; repeat or comma-separate.", collectList, [])
  .option("--note <text>", "Optional human-readable context copied into the handoff.")
  .addOption(new Option("--question <text>", "Legacy alias for --note.").hideHelp())
  .option("--max-age-minutes <minutes>", "Fail if snapshot.exportedAt is older than this many minutes; default is 30.", (value) =>
    Number.parseFloat(value)
  )
  .option("--clean", "Delete output-dir before writing the handoff.", false)
  .option("--no-include-snapshot", "Do not copy latest.json/latest-manifest.json into output-dir.")
  .option("--no-render-map", "Do not render visible-map.svg even when visibleMap is available.")
  .option("--format <format>", "Output format: markdown or json.", "markdown")
  .parse();

const options = program.opts<{
  snapshot?: string;
  snapshotDir?: string;
  outputDir: string;
  intent: string[];
  module: string[];
  note?: string;
  question?: string;
  maxAgeMinutes?: number;
  clean: boolean;
  includeSnapshot: boolean;
  renderMap: boolean;
  format: string;
}>();

const report = await runCopilotHandoff({
  snapshotPath: options.snapshot,
  snapshotDir: options.snapshotDir,
  outputDir: options.outputDir,
  question: options.note ?? options.question,
  intents: options.intent,
  requiredModules: options.module,
  maxAgeMinutes: options.maxAgeMinutes,
  clean: options.clean,
  includeSnapshot: options.includeSnapshot,
  renderMap: options.renderMap
});

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatCopilotHandoffMarkdown(report));
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
