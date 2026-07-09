#!/usr/bin/env tsx
import path from "node:path";
import { program } from "commander";
import { createManualEvidenceDraft, formatManualEvidenceDraftMarkdown } from "./manual-evidence-draft.js";
import { VERSION } from "../../project/src/version.js";

program
  .name("civ6-ai-copilot-manual-evidence-draft")
  .description("Create a structured manual-evidence JSON draft from Windows smoke-test tool outputs.")
  .option("--root <dir>", "Repository root.", ".")
  .option("--mod-source <dir>", "Mod source directory.", "mod")
  .option("--input-log <path>", "Civilization VI Lua.log or fake Lua.log path.")
  .option("--snapshot <path>", "Snapshot JSON path.")
  .option("--snapshot-dir <dir>", "Directory containing latest.json.")
  .option("--handoff-dir <dir>", "Mac Codex handoff directory containing codex-prompt.md and copilot-handoff.md.")
  .option("--player-a-snapshot <path>", "Player A latest.json from the multiplayer fairness test.")
  .option("--player-b-snapshot <path>", "Player B latest.json from the multiplayer fairness test.")
  .option("--question <text>", "Question used for preflight/module checks.", "我现在该不该开战？")
  .option("--civ6-build <text>", "Civ6 build id to write into the draft.", "fill-after-real-test")
  .option("--ruleset <text>", "Ruleset to write into the draft; defaults to snapshot.session.ruleset when available.")
  .option("--mod-version <text>", "Mod version to write into the draft.", VERSION)
  .requiredOption("--output <path>", "Path to write manual-evidence-draft.json.")
  .option("--format <format>", "Output format: markdown or json.", "markdown")
  .parse();

const options = program.opts<{
  root: string;
  modSource: string;
  inputLog?: string;
  snapshot?: string;
  snapshotDir?: string;
  handoffDir?: string;
  playerASnapshot?: string;
  playerBSnapshot?: string;
  question: string;
  civ6Build: string;
  ruleset?: string;
  modVersion: string;
  output: string;
  format: string;
}>();

const rootDir = path.resolve(options.root);
const report = await createManualEvidenceDraft({
  rootDir,
  modSourceDir: path.isAbsolute(options.modSource) ? options.modSource : path.resolve(rootDir, options.modSource),
  inputLog: options.inputLog,
  snapshotPath: options.snapshot,
  snapshotDir: options.snapshotDir,
  handoffDir: options.handoffDir,
  playerASnapshot: options.playerASnapshot,
  playerBSnapshot: options.playerBSnapshot,
  question: options.question,
  civ6Build: options.civ6Build,
  ruleset: options.ruleset,
  modVersion: options.modVersion,
  outputPath: options.output
});

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatManualEvidenceDraftMarkdown(report));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

if (process.exitCode === undefined && !report.draftValidation.schemaOk) {
  process.exitCode = 1;
}
