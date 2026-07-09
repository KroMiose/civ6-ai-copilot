#!/usr/bin/env tsx
import { program } from "commander";
import {
  finalizeManualEvidence,
  formatManualEvidenceFinalizeMarkdown
} from "./manual-evidence-finalize.js";

program
  .name("civ6-ai-copilot-manual-evidence-finalize")
  .description("Finalize a structured manual-evidence draft after explicit real-test confirmations.")
  .requiredOption("--input <path>", "Input manual-evidence draft JSON.")
  .requiredOption("--output <path>", "Path to write finalized manual-evidence.json.")
  .option("--confirm-windows-smoke", "Confirm tests/manual/windows-civ6-smoke-test.md passed.", false)
  .option("--confirm-multiplayer-fairness", "Confirm tests/manual/multiplayer-fairness-test.md passed.", false)
  .option("--confirm-mac-codex-copilot", "Confirm Mac Codex skill install/validation and handoff prompt workflow passed.", false)
  .option("--confirm-artifact-scope", "Confirm the evidence JSON is limited to release-gate conclusions and required version/build metadata.", false)
  .option("--civ6-build <text>", "Civ6 build id to write into windowsSmoke.civ6Build.")
  .option("--ruleset <text>", "Ruleset to write into windowsSmoke and multiplayerFairness.")
  .option("--mod-version <text>", "Mod version to write into the evidence.")
  .option("--notes <text>", "Notes to write into the top-level notes field.")
  .option("--format <format>", "Output format: markdown or json.", "markdown")
  .parse();

const options = program.opts<{
  input: string;
  output: string;
  confirmWindowsSmoke: boolean;
  confirmMultiplayerFairness: boolean;
  confirmMacCodexCopilot: boolean;
  confirmArtifactScope: boolean;
  civ6Build?: string;
  ruleset?: string;
  modVersion?: string;
  notes?: string;
  format: string;
}>();

const report = await finalizeManualEvidence({
  inputPath: options.input,
  outputPath: options.output,
  confirmWindowsSmoke: options.confirmWindowsSmoke,
  confirmMultiplayerFairness: options.confirmMultiplayerFairness,
  confirmMacCodexCopilot: options.confirmMacCodexCopilot,
  confirmArtifactScope: options.confirmArtifactScope,
  civ6Build: options.civ6Build,
  ruleset: options.ruleset,
  modVersion: options.modVersion,
  notes: options.notes
});

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatManualEvidenceFinalizeMarkdown(report));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

if (process.exitCode === undefined && !report.ok) {
  process.exitCode = 1;
}
