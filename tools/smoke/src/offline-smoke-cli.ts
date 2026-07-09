#!/usr/bin/env tsx
import path from "node:path";
import { Option, program } from "commander";
import { formatOfflineSmokeMarkdown, runOfflineSmoke } from "./offline-smoke.js";

program
  .name("civ6-ai-copilot-offline-smoke")
  .description("Run the full fake Lua.log -> bridge -> doctor -> preflight -> summarize -> render-map -> handoff loop.")
  .option("--root <dir>", "Repository root.", ".")
  .option("--snapshot <path>", "Sanitized snapshot fixture to encode into fake Lua.log.")
  .option("--output-dir <dir>", "Directory for smoke outputs. Defaults to a temp directory.")
  .option("--intent <intent>", "Stable analysis intent; repeat or comma-separate.", collectList, [])
  .option("--module <module>", "Explicit required briefing module; repeat or comma-separate.", collectList, [])
  .option("--note <text>", "Optional human-readable smoke-test note.")
  .addOption(new Option("--question <text>", "Legacy alias for --note.").hideHelp())
  .option("--export-id <id>", "Export id to embed into fake Lua.log.", "offline-smoke-export")
  .option("--chunk-size <chars>", "Base64 characters per fake Lua.log chunk.", (value) => Number.parseInt(value, 10), 256)
  .option("--clean", "Remove --output-dir before writing outputs.", false)
  .option("--format <format>", "Output format: markdown or json.", "markdown")
  .parse();

const options = program.opts<{
  root: string;
  snapshot?: string;
  outputDir?: string;
  intent: string[];
  module: string[];
  note?: string;
  question?: string;
  exportId: string;
  chunkSize: number;
  clean: boolean;
  format: string;
}>();

if (!Number.isFinite(options.chunkSize) || options.chunkSize < 64) {
  program.error("--chunk-size must be a number >= 64");
}

const report = await runOfflineSmoke({
  rootDir: path.resolve(options.root),
  snapshotPath: options.snapshot,
  outputDir: options.outputDir,
  question: options.note ?? options.question,
  intents: options.intent.length > 0 ? options.intent : undefined,
  requiredModules: options.module,
  exportId: options.exportId,
  chunkSize: options.chunkSize,
  clean: options.clean
});

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatOfflineSmokeMarkdown(report));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

if (process.exitCode === undefined && !report.ok) {
  process.exitCode = 1;
}

function collectList(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(",").map((item) => item.trim()).filter(Boolean)];
}
