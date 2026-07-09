#!/usr/bin/env tsx
import { Option, program } from "commander";
import { formatCopilotPrepareMarkdown, runCopilotPrepare, type CopilotRefreshMode } from "./prepare.js";

program
  .name("civ6-ai-copilot")
  .description("Prepare the current Civ6 player-visible briefing for Agent analysis.")
  .option("--intent <intent>", "Stable analysis intent; repeat or comma-separate. Examples: turn-priority, war, policy, settling.", collectList, [])
  .option("--module <module>", "Explicit required briefing module; repeat or comma-separate.", collectList, [])
  .option("--note <text>", "Optional human-readable context copied into the handoff.")
  .addOption(new Option("--question <text>", "Legacy alias for --note.").hideHelp())
  .option("--platform <platform>", "Target platform: win32, darwin, or linux. Defaults to the current platform.")
  .option("--home <dir>", "Target user's home directory. Defaults to the current user's home.")
  .option("--civ6-user-data-dir <dir>", "Override the Civ6 user-data root.")
  .option("--mods-dir <dir>", "Override the Civ6 Mods directory.")
  .option("--logs-dir <dir>", "Override the Civ6 Logs directory.")
  .option("--lua-log <path>", "Override the full Civilization VI Lua.log path.")
  .option("--codex-home <dir>", "Codex home directory. Defaults to <home>/.codex.")
  .option("--snapshot-dir <dir>", "Snapshot output directory.")
  .option("--handoff-dir <dir>", "Handoff output directory.")
  .option("--refresh <mode>", "Snapshot refresh mode: auto, tuner, bridge, or none.", "auto")
  .option("--max-age-minutes <minutes>", "Fail if snapshot.exportedAt is older than this many minutes; default is 30.", (value) =>
    Number.parseFloat(value)
  )
  .option("--clean", "Delete handoff-dir before writing the handoff.", false)
  .option("--no-include-snapshot", "Do not copy latest.json/latest-manifest.json into handoff-dir.")
  .option("--no-render-map", "Do not render visible-map.svg even when visibleMap is available.")
  .option("--host <host>", "Tuner host.", "127.0.0.1")
  .option("--port <port>", "Specific tuner port; defaults to trying 4318 then 4319.", parsePort)
  .option("--state <name>", "Lua state to read from; defaults to project luaStateName.")
  .option("--timeout-ms <ms>", "Socket read/write timeout.", parsePositiveInteger, 8000)
  .option("--allow-invalid", "Write snapshots even when schema/fairness validation fails.", false)
  .option("--format <format>", "Output format: markdown or json.", "markdown")
  .parse();

const options = program.opts<{
  intent: string[];
  module: string[];
  note?: string;
  question?: string;
  platform?: "win32" | "darwin" | "linux";
  home?: string;
  civ6UserDataDir?: string;
  modsDir?: string;
  logsDir?: string;
  luaLog?: string;
  codexHome?: string;
  snapshotDir?: string;
  handoffDir?: string;
  refresh: string;
  maxAgeMinutes?: number;
  clean: boolean;
  includeSnapshot: boolean;
  renderMap: boolean;
  host: string;
  port?: number;
  state?: string;
  timeoutMs: number;
  allowInvalid: boolean;
  format: string;
}>();

if (!isRefreshMode(options.refresh)) {
  program.error("--refresh must be one of: auto, tuner, bridge, none");
}

const report = await runCopilotPrepare({
  question: options.note ?? options.question,
  intents: options.intent,
  requiredModules: options.module,
  platform: options.platform,
  homeDir: options.home,
  civ6UserDataDir: options.civ6UserDataDir,
  modsDir: options.modsDir,
  logsDir: options.logsDir,
  luaLogPath: options.luaLog,
  codexHome: options.codexHome,
  snapshotDir: options.snapshotDir,
  handoffDir: options.handoffDir,
  refreshMode: options.refresh,
  maxAgeMinutes: options.maxAgeMinutes,
  clean: options.clean,
  includeSnapshot: options.includeSnapshot,
  renderMap: options.renderMap,
  host: options.host,
  port: options.port,
  state: options.state,
  timeoutMs: options.timeoutMs,
  allowInvalid: options.allowInvalid
});

if (options.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (options.format === "markdown") {
  process.stdout.write(formatCopilotPrepareMarkdown(report));
} else {
  console.error(`Unsupported format: ${options.format}`);
  process.exitCode = 2;
}

if (process.exitCode === undefined && report.exitCode !== 0) {
  process.exitCode = report.exitCode;
}

function isRefreshMode(value: string): value is CopilotRefreshMode {
  return value === "auto" || value === "tuner" || value === "bridge" || value === "none";
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }
  return port;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("value must be a positive integer");
  }
  return parsed;
}

function collectList(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(",").map((item) => item.trim()).filter(Boolean)];
}
