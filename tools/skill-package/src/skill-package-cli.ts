#!/usr/bin/env tsx
import path from "node:path";
import { program } from "commander";
import {
  createSkillPackageDirectory,
  defaultCodexSkillsDir,
  installSkill,
  validatePackagedSkill,
  validateSkillSource
} from "./skill-package.js";

program
  .name("civ6-ai-copilot-skill")
  .description("Validate or package the civ6-ai-copilot Agent Skill.")
  .option("--source <dir>", "Source skill directory.", "skill");

program
  .command("validate")
  .description("Validate the source skill folder layout, metadata, and Mod-guided workflow markers.")
  .action(async () => {
    const options = program.opts<{ source: string }>();
    const validation = await validateSkillSource(path.resolve(options.source));
    console.log(JSON.stringify(validation, null, 2));
    if (!validation.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("package")
  .description("Copy the source skill into a release-ready folder named civ6-ai-copilot.")
  .requiredOption("-o, --output-dir <dir>", "Directory that will receive civ6-ai-copilot/.")
  .option("--clean", "Remove the target package folder before copying.", false)
  .action(async (commandOptions: { outputDir: string; clean: boolean }) => {
    const options = program.opts<{ source: string }>();
    const result = await createSkillPackageDirectory({
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
  .description("Install the source skill into the local Agent skills directory.")
  .option("--skills-dir <dir>", "Directory containing Agent skill folders.", defaultCodexSkillsDir())
  .option("--clean", "Remove the installed civ6-ai-copilot skill folder before copying.", false)
  .action(async (commandOptions: { skillsDir: string; clean: boolean }) => {
    const options = program.opts<{ source: string }>();
    const result = await installSkill({
      sourceDir: path.resolve(options.source),
      skillsDir: path.resolve(commandOptions.skillsDir),
      clean: commandOptions.clean
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.validation.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("validate-package")
  .description("Validate a packaged skill folder and its manifest.")
  .requiredOption("-p, --package-dir <dir>", "Packaged civ6-ai-copilot skill folder.")
  .action(async (commandOptions: { packageDir: string }) => {
    const validation = await validatePackagedSkill(path.resolve(commandOptions.packageDir));
    console.log(JSON.stringify(validation, null, 2));
    if (!validation.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("validate-installed")
  .description("Validate the installed civ6-ai-copilot skill in the local Agent skills directory.")
  .option("--skills-dir <dir>", "Directory containing Agent skill folders.", defaultCodexSkillsDir())
  .action(async (commandOptions: { skillsDir: string }) => {
    const validation = await validatePackagedSkill(path.join(path.resolve(commandOptions.skillsDir), "civ6-ai-copilot"));
    console.log(JSON.stringify(validation, null, 2));
    if (!validation.ok) {
      process.exitCode = 1;
    }
  });

program.parse();
