#!/usr/bin/env tsx
import path from "node:path";
import { program } from "commander";
import { runPrivacyCheck } from "./privacy-check.js";

program
  .name("civ6-ai-copilot-privacy")
  .description("Check repository artifacts for release-blocking local captures, credentials, and machine-specific paths.")
  .option("--root <dir>", "Repository root to scan.", ".")
  .parse();

const options = program.opts<{ root: string }>();
const result = await runPrivacyCheck({ rootDir: path.resolve(options.root) });

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
