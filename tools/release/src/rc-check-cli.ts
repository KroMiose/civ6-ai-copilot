#!/usr/bin/env tsx
import path from "node:path";
import { program } from "commander";
import { formatRcCheckMarkdown, runRcCheck } from "./rc-check.js";

program
  .name("civ6-ai-copilot-rc-check")
  .description("Run the offline release-candidate checks for the civ6-ai-copilot minimum loop.")
  .option("--root <dir>", "Repository root.", ".")
  .option("--format <format>", "Output format: json or markdown.", "json")
  .option("--manual-evidence <file>", "Sanitized JSON evidence from real Windows and multiplayer manual tests.")
  .option("--keep-temp", "Keep the temporary release/check directory and include its path in the report.", false)
  .parse();

const options = program.opts<{
  root: string;
  format: string;
  manualEvidence?: string;
  keepTemp: boolean;
}>();

const report = await runRcCheck({
  rootDir: path.resolve(options.root),
  manualEvidencePath: options.manualEvidence,
  keepTemp: options.keepTemp
});

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatRcCheckMarkdown(report));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

if (!report.automaticOk && process.exitCode === undefined) {
  process.exitCode = 1;
}
