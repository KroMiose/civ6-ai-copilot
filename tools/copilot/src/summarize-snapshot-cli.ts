#!/usr/bin/env tsx
import { Option, program } from "commander";
import {
  formatSnapshotSummaryMarkdown,
  SnapshotSummaryError,
  summarizeSnapshotFile
} from "./summarize-snapshot.js";

program
  .name("civ6-ai-copilot-summarize")
  .description("Create a concise Chinese copilot brief from a validated civ6-ai-copilot snapshot.")
  .requiredOption("--snapshot <path>", "Path to snapshot JSON, usually latest.json from the bridge.")
  .option("--intent <intent>", "Stable analysis intent; repeat or comma-separate. Examples: turn-priority, war, policy, settling.", collectList, [])
  .option("--module <module>", "Explicit required briefing module; repeat or comma-separate.", collectList, [])
  .option("--note <text>", "Optional human-readable context for the generated brief.")
  .addOption(new Option("--question <text>", "Legacy alias for --note.").hideHelp())
  .option("--format <format>", "Output format: markdown or json.", "markdown")
  .option("--allow-invalid", "Emit a summary even if schema or fairness validation fails.")
  .parse();

const options = program.opts<{
  snapshot: string;
  intent: string[];
  module: string[];
  note?: string;
  question?: string;
  format: string;
  allowInvalid?: boolean;
}>();

try {
  const summary = await summarizeSnapshotFile(options.snapshot, {
    question: options.note ?? options.question,
    intents: options.intent,
    requiredModules: options.module,
    allowInvalid: options.allowInvalid
  });

  if (options.format === "json") {
    console.log(JSON.stringify(summary, null, 2));
  } else if (options.format === "markdown") {
    process.stdout.write(formatSnapshotSummaryMarkdown(summary));
  } else {
    console.error(`Unsupported format: ${options.format}`);
    process.exitCode = 2;
  }
} catch (error) {
  if (error instanceof SnapshotSummaryError) {
    console.error(error.message);
    console.error(JSON.stringify(error.validation, null, 2));
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function collectList(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(",").map((item) => item.trim()).filter(Boolean)];
}
