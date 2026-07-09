#!/usr/bin/env tsx
import path from "node:path";
import { program } from "commander";
import { formatDoctorMarkdown, runDoctor } from "./doctor.js";

program
  .name("civ6-ai-copilot-doctor")
  .description("Diagnose civ6-ai-copilot Mod packaging, Lua.log exports, and snapshot validation.")
  .option("--mod-source <dir>", "Mod source directory.", "mod")
  .option("--input-log <path>", "Civilization VI Lua.log or fake Lua.log path.")
  .option("--user-interface-log <path>", "Civilization VI UserInterface.log path.")
  .option("--modding-log <path>", "Civilization VI Modding.log path.")
  .option("--database-log <path>", "Civilization VI Database.log path.")
  .option("--snapshot <path>", "Snapshot JSON path.")
  .option("--snapshot-dir <dir>", "Snapshot directory containing latest.json.")
  .option("--format <format>", "Output format: json or markdown.", "json")
  .parse();

const options = program.opts<{
  modSource: string;
  inputLog?: string;
  userInterfaceLog?: string;
  moddingLog?: string;
  databaseLog?: string;
  snapshot?: string;
  snapshotDir?: string;
  format: string;
}>();

const report = await runDoctor({
  modSourceDir: path.resolve(options.modSource),
  inputLog: options.inputLog ? path.resolve(options.inputLog) : undefined,
  userInterfaceLog: options.userInterfaceLog ? path.resolve(options.userInterfaceLog) : undefined,
  moddingLog: options.moddingLog ? path.resolve(options.moddingLog) : undefined,
  databaseLog: options.databaseLog ? path.resolve(options.databaseLog) : undefined,
  snapshot: options.snapshot ? path.resolve(options.snapshot) : undefined,
  snapshotDir: options.snapshotDir ? path.resolve(options.snapshotDir) : undefined
});

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatDoctorMarkdown(report));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

if (process.exitCode === undefined && !report.ok) {
  process.exitCode = 1;
}
