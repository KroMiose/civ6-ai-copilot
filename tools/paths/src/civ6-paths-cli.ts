#!/usr/bin/env tsx
import { Option, program } from "commander";
import {
  buildCiv6AICopilotPaths,
  formatCiv6AICopilotPathsMarkdown,
  formatCiv6AICopilotPathsPowerShell
} from "./civ6-paths.js";

program
  .name("civ6-ai-copilot-paths")
  .description("Print platform-specific Civ6, Lua.log, snapshot, handoff, and Agent Skill paths for civ6-ai-copilot testing.")
  .option("--platform <platform>", "Target platform: win32, darwin, or linux. Defaults to the current platform.")
  .option("--home <dir>", "Target user's home directory. Defaults to the current user's home.")
  .option("--civ6-user-data-dir <dir>", "Override the Civ6 user-data root. macOS derives separate Mods and Firaxis Logs children from this root.")
  .option("--mods-dir <dir>", "Override the Civ6 Mods directory.")
  .option("--logs-dir <dir>", "Override the Civ6 Logs directory.")
  .option("--lua-log <path>", "Override the full Civilization VI Lua.log path.")
  .option("--codex-home <dir>", "Codex home directory. Defaults to <home>/.codex.")
  .option("--snapshot-dir <dir>", "Snapshot output directory.")
  .option("--handoff-dir <dir>", "Windows-to-Mac handoff output directory.")
  .option("--intent <intent>", "Stable analysis intent for command examples; repeat or comma-separate.", collectList, [])
  .option("--module <module>", "Explicit required briefing module for command examples; repeat or comma-separate.", collectList, [])
  .addOption(new Option("--question <text>", "Legacy option kept for compatibility.").hideHelp())
  .option("--format <format>", "Output format: markdown or json.", "markdown")
  .parse();

const options = program.opts<{
  platform?: NodeJS.Platform;
  home?: string;
  civ6UserDataDir?: string;
  modsDir?: string;
  logsDir?: string;
  luaLog?: string;
  codexHome?: string;
  snapshotDir?: string;
  handoffDir?: string;
  intent: string[];
  module: string[];
  question?: string;
  format: string;
}>();

const paths = buildCiv6AICopilotPaths({
  platform: options.platform,
  homeDir: options.home,
  civ6UserDataDir: options.civ6UserDataDir,
  modsDir: options.modsDir,
  logsDir: options.logsDir,
  luaLogPath: options.luaLog,
  codexHome: options.codexHome,
  snapshotDir: options.snapshotDir,
  handoffDir: options.handoffDir,
  question: options.question,
  intents: options.intent,
  requiredModules: options.module
});

if (options.format === "json") {
  console.log(JSON.stringify(paths, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatCiv6AICopilotPathsMarkdown(paths));
} else if (options.format === "powershell") {
  process.stdout.write(formatCiv6AICopilotPathsPowerShell(paths));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

function collectList(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(",").map((item) => item.trim()).filter(Boolean)];
}
