#!/usr/bin/env tsx
import path from "node:path";
import { program } from "commander";
import { createReleaseBundle, validateReleaseBundle } from "./release-bundle.js";

program
  .name("civ6-ai-copilot-release")
  .description("Create or validate a full civ6-ai-copilot release bundle containing the Mod, skill, docs, and manual-test templates.");

program
  .command("package")
  .description("Create a release-ready civ6-ai-copilot-release/ bundle.")
  .option("--root <dir>", "Repository root.", ".")
  .requiredOption("-o, --output-dir <dir>", "Directory that will receive civ6-ai-copilot-release/.")
  .option("--clean", "Remove the target bundle before writing.", false)
  .action(async (options: { root: string; outputDir: string; clean: boolean }) => {
    const result = await createReleaseBundle({
      rootDir: path.resolve(options.root),
      outputDir: path.resolve(options.outputDir),
      clean: options.clean
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.validation.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("validate")
  .description("Validate a generated civ6-ai-copilot-release/ bundle and its manifest.")
  .requiredOption("-b, --bundle-dir <dir>", "Generated civ6-ai-copilot-release folder.")
  .action(async (options: { bundleDir: string }) => {
    const validation = await validateReleaseBundle(path.resolve(options.bundleDir));
    console.log(JSON.stringify(validation, null, 2));
    if (!validation.ok) {
      process.exitCode = 1;
    }
  });

program.parse();
