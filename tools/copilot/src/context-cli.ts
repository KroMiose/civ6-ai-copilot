#!/usr/bin/env tsx
import { Option, program } from "commander";
import { runCopilotContext } from "./context.js";
import type { CopilotRefreshMode } from "./prepare.js";

program
  .name("civ6-ai-copilot-context")
  .description("Return one canonical, validated Civ6 context payload for Agent analysis.")
  .option("--query <text>", "The player's question. Stored for the agent; it does not select modules.")
  .option("--module <module>", "Ignored for output. Raw modules are not inlined; use --city, --unit, --map, or --raw.", collectList, [])
  .option("--city <name>", "Expand one city by name or id.")
  .option("--unit <name>", "Expand one unit by name or id.")
  .option("--raw", "Write the raw export to a file and return its path only.", false)
  .option("--adjacent-units", "Add odd-r adjacent tiles for the local player's units.", false)
  .option("--render-map <path>", "Write a player-visible hex SVG for this export.")
  .option("--map <spec>", "Map view. Repeat. world | region[:city|unit|coord|selection:value[:radius]] | local[:...]. Region defaults to radius 8, local to 5, maximum 20.", collectList, [])
  .option("--platform <platform>", "Target platform: win32, darwin, or linux. Defaults to the current platform.")
  .option("--home <dir>", "Target user's home directory. Defaults to the current user's home.")
  .option("--civ6-user-data-dir <dir>", "Override the Civ6 user-data root.")
  .option("--mods-dir <dir>", "Override the Civ6 Mods directory.")
  .option("--logs-dir <dir>", "Override the Civ6 Logs directory.")
  .option("--lua-log <path>", "Override the full Civilization VI Lua.log path.")
  .option("--codex-home <dir>", "Codex home directory. Defaults to <home>/.codex.")
  .option("--snapshot-dir <dir>", "Snapshot output directory.")
  .option("--refresh <mode>", "Snapshot refresh mode: auto, tuner, bridge, or none.", "auto")
  .option("--host <host>", "Tuner host.", "127.0.0.1")
  .option("--port <port>", "Specific tuner port; defaults to trying 4318 then 4319.", parsePort)
  .option("--state <name>", "Lua state to read from; defaults to project luaStateName.")
  .option("--timeout-ms <ms>", "Socket read/write timeout.", parsePositiveInteger, 8000)
  .option("--allow-invalid", "Allow refresh to write an invalid snapshot for diagnostics.", false)
  .addOption(new Option("--question <text>", "Legacy alias for --query.").hideHelp())
  .parse();

const options = program.opts<{
  query?: string;
  question?: string;
  module: string[];
  adjacentUnits: boolean;
  renderMap?: string;
  map: string[];
  city?: string;
  unit?: string;
  raw: boolean;
  platform?: "win32" | "darwin" | "linux";
  home?: string;
  civ6UserDataDir?: string;
  modsDir?: string;
  logsDir?: string;
  luaLog?: string;
  codexHome?: string;
  snapshotDir?: string;
  refresh: string;
  host: string;
  port?: number;
  state?: string;
  timeoutMs: number;
  allowInvalid: boolean;
}>();

if (!isRefreshMode(options.refresh)) {
  program.error("--refresh must be one of: auto, tuner, bridge, none");
}

const report = await runCopilotContext({
  question: options.query ?? options.question,
  modules: options.module,
  adjacentUnits: options.adjacentUnits,
  renderMapPath: options.renderMap,
  mapSpecs: options.map,
  city: options.city,
  unit: options.unit,
  raw: options.raw,
  platform: options.platform,
  homeDir: options.home,
  civ6UserDataDir: options.civ6UserDataDir,
  modsDir: options.modsDir,
  logsDir: options.logsDir,
  luaLogPath: options.luaLog,
  codexHome: options.codexHome,
  snapshotDir: options.snapshotDir,
  refreshMode: options.refresh,
  host: options.host,
  port: options.port,
  state: options.state,
  timeoutMs: options.timeoutMs,
  allowInvalid: options.allowInvalid
});

console.log(JSON.stringify(report, null, 2));
if (report.exitCode !== 0) process.exitCode = report.exitCode;

function isRefreshMode(value: string): value is CopilotRefreshMode {
  return value === "auto" || value === "tuner" || value === "bridge" || value === "none";
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("--port must be an integer from 1 to 65535");
  return port;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("value must be a positive integer");
  return parsed;
}

function collectList(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(",").map((item) => item.trim()).filter(Boolean)];
}
