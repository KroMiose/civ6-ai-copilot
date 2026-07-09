#!/usr/bin/env tsx
import { program } from "commander";
import { formatManualEvidenceMarkdown, runManualEvidenceCheck } from "./manual-evidence.js";

program
  .name("civ6-ai-copilot-manual-evidence")
  .description("Validate sanitized manual evidence for real Windows Civ6, multiplayer fairness, and Mac Codex handoff copilot gates.")
  .requiredOption("--evidence <file>", "Sanitized JSON evidence from real Windows, multiplayer, and Mac Codex manual tests.")
  .option("--format <format>", "Output format: json or markdown.", "markdown")
  .parse();

const options = program.opts<{
  evidence: string;
  format: string;
}>();

const report = await runManualEvidenceCheck({ evidencePath: options.evidence });

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatManualEvidenceMarkdown(report));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

if (!report.ok && process.exitCode === undefined) {
  process.exitCode = 1;
}
