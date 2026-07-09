#!/usr/bin/env tsx
import path from "node:path";
import { program } from "commander";
import {
  createPackageDirectory,
  defaultCiv6ModsDir,
  installMod,
  validateModSource
} from "./mod-package.js";

program
  .name("civ6-ai-copilot-mod")
  .description("Validate, package, or install the civ6-ai-copilot Civilization VI UI Mod.")
  .option("--source <dir>", "Source mod directory.", "mod");

program
  .command("validate")
  .description("Validate the source mod folder layout and .modinfo wiring.")
  .action(async () => {
    const options = program.opts<{ source: string }>();
    const validation = await validateModSource(path.resolve(options.source));
    console.log(JSON.stringify(validation, null, 2));
    if (!validation.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("package")
  .description("Copy the source mod into a release-ready folder named civ6-ai-copilot.")
  .requiredOption("-o, --output-dir <dir>", "Directory that will receive civ6-ai-copilot/.")
  .option("--clean", "Remove the target package folder before copying.", false)
  .action(async (commandOptions: { outputDir: string; clean: boolean }) => {
    const options = program.opts<{ source: string }>();
    const result = await createPackageDirectory({
      sourceDir: path.resolve(options.source),
      outputDir: path.resolve(commandOptions.outputDir),
      clean: commandOptions.clean
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.validation.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("install")
  .description("Install the source mod into a Civilization VI Mods directory.")
  .option("--mods-dir <dir>", "Civ6 Mods directory. Defaults to the common path for this OS.")
  .option("--clean", "Remove the existing civ6-ai-copilot folder before copying.", false)
  .action(async (commandOptions: { modsDir?: string; clean: boolean }) => {
    const options = program.opts<{ source: string }>();
    const modsDir = path.resolve(commandOptions.modsDir ?? defaultCiv6ModsDir());
    const result = await installMod({
      sourceDir: path.resolve(options.source),
      modsDir,
      clean: commandOptions.clean
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.validation.ok) {
      process.exitCode = 1;
    }
  });

program.parse();
