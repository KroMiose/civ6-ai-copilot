import { mkdir, readFile } from "node:fs/promises";
import { buildCiv6AICopilotPaths, type Civ6AICopilotPaths } from "../../paths/src/civ6-paths.js";
import {
  runCopilotRefresh,
  type CopilotPrepareOptions,
  type CopilotRefreshReport
} from "./prepare.js";
import { runCopilotPreflight, type CopilotPreflightReport } from "./preflight.js";
import type { SnapshotSummary } from "./summarize-snapshot.js";

export type CopilotContextStatus = "ready" | "needs-game-refresh" | "runtime-error";

export interface CopilotContextOptions extends Omit<CopilotPrepareOptions, "handoffDir" | "clean" | "includeSnapshot" | "renderMap"> {
  includeMap?: boolean;
}

export interface CopilotContextReport {
  contractVersion: "1";
  status: CopilotContextStatus;
  readyForCopilot: boolean;
  exitCode: number;
  generatedAt: string;
  query?: string;
  identity?: {
    exportId?: string;
    sessionId?: string;
    gameTurn?: number;
    exportedAt?: string;
    modVersion?: string;
    compatVersion?: string;
    protocolVersion?: string;
    schemaVersion?: string;
  };
  refresh: CopilotRefreshReport;
  preflight?: CopilotPreflightReport;
  summary?: SnapshotSummary;
  context?: Record<string, unknown>;
  canonical: {
    snapshotDir: string;
    snapshotPath?: string;
    manifestPath?: string;
  };
  userActions: string[];
}

const MODULE_TO_KEYS: Record<string, string[]> = {
  meta: ["source", "session"],
  localPlayer: ["localPlayer"],
  selection: ["selection"],
  cities: ["cities"],
  units: ["units"],
  governors: ["governors"],
  trade: ["trade"],
  cityStates: ["cityStates"],
  techs: ["techs"],
  civics: ["civics"],
  government: ["government"],
  policies: ["government"],
  resources: ["resources"],
  diplomacyPublic: ["diplomacy"],
  visibleMap: ["visibleMap"],
  economy: ["economy"]
};

const MAP_INTENTS = new Set(["war", "navy", "exploration", "settling", "district-planning"]);

export async function runCopilotContext(options: CopilotContextOptions = {}): Promise<CopilotContextReport> {
  const paths = buildCiv6AICopilotPaths({
    platform: options.platform,
    homeDir: options.homeDir,
    civ6UserDataDir: options.civ6UserDataDir,
    modsDir: options.modsDir,
    logsDir: options.logsDir,
    luaLogPath: options.luaLogPath,
    codexHome: options.codexHome,
    snapshotDir: options.snapshotDir,
    question: options.question,
    intents: options.intents,
    requiredModules: options.requiredModules
  });

  await mkdir(paths.snapshotDir, { recursive: true });
  const refresh = await runCopilotRefresh(paths, options);
  if (refresh.attempted && !refresh.ok) {
    return {
      contractVersion: "1",
      status: "needs-game-refresh",
      readyForCopilot: false,
      exitCode: refresh.exitCode,
      generatedAt: new Date().toISOString(),
      query: options.question,
      refresh,
      canonical: { snapshotDir: paths.snapshotDir },
      userActions: refreshActions(refresh, paths)
    };
  }

  const preflight = await runCopilotPreflight({
    snapshotDir: paths.snapshotDir,
    question: options.question,
    intents: options.intents,
    requiredModules: options.requiredModules,
    maxAgeMinutes: options.maxAgeMinutes
  });

  if (!preflight.canAnalyze || !preflight.snapshotPath || !preflight.summary) {
    return {
      contractVersion: "1",
      status: preflight.exitCode === 2 ? "needs-game-refresh" : "runtime-error",
      readyForCopilot: false,
      exitCode: preflight.exitCode,
      generatedAt: new Date().toISOString(),
      query: options.question,
      refresh,
      preflight,
      summary: preflight.summary,
      canonical: {
        snapshotDir: paths.snapshotDir,
        snapshotPath: preflight.snapshotPath,
        manifestPath: preflight.manifestPath
      },
      userActions: preflight.nextActions
    };
  }

  const snapshot = JSON.parse(await readFile(preflight.snapshotPath, "utf8")) as Record<string, any>;
  const includeMap = options.includeMap ?? shouldIncludeMap(preflight.summary);
  const context = projectSnapshot(snapshot, preflight.summary, includeMap);

  return {
    contractVersion: "1",
    status: "ready",
    readyForCopilot: true,
    exitCode: 0,
    generatedAt: new Date().toISOString(),
    query: options.question,
    identity: {
      exportId: text(snapshot.source?.exportId),
      sessionId: text(snapshot.session?.sessionId),
      gameTurn: integer(snapshot.session?.gameTurn),
      exportedAt: text(snapshot.exportedAt),
      modVersion: text(snapshot.source?.modVersion),
      compatVersion: text(snapshot.source?.compatVersion),
      protocolVersion: text(snapshot.source?.protocolVersion),
      schemaVersion: text(snapshot.schemaVersion)
    },
    refresh,
    preflight,
    summary: preflight.summary,
    context,
    canonical: {
      snapshotDir: paths.snapshotDir,
      snapshotPath: preflight.snapshotPath,
      manifestPath: preflight.manifestPath
    },
    userActions: []
  };
}

function projectSnapshot(
  snapshot: Record<string, any>,
  summary: SnapshotSummary,
  includeMap: boolean
): Record<string, unknown> {
  const keys = new Set<string>(["schemaVersion", "exportedAt", "source", "session", "localPlayer", "attention"]);
  for (const moduleName of summary.syncAdvice.requiredModules) {
    for (const key of MODULE_TO_KEYS[moduleName] ?? []) {
      if (key !== "visibleMap" || includeMap) keys.add(key);
    }
  }

  if (includeMap && snapshot.visibleMap) keys.add("visibleMap");

  const projected: Record<string, unknown> = {};
  for (const key of keys) {
    if (snapshot[key] !== undefined) projected[key] = snapshot[key];
  }

  if (snapshot.moduleStatus && typeof snapshot.moduleStatus === "object") {
    const relevantModules = new Set(summary.syncAdvice.requiredModules);
    if (includeMap) relevantModules.add("visibleMap");
    projected.moduleStatus = Object.fromEntries(
      Object.entries(snapshot.moduleStatus).filter(([name]) => relevantModules.has(name))
    );
  }

  if (snapshot.confidence !== undefined) projected.confidence = snapshot.confidence;
  return projected;
}

function shouldIncludeMap(summary: SnapshotSummary): boolean {
  return summary.syncAdvice.requiredModules.includes("visibleMap")
    || summary.syncAdvice.intents.some((intent) => MAP_INTENTS.has(intent));
}

function refreshActions(refresh: CopilotRefreshReport, paths: Civ6AICopilotPaths): string[] {
  const actions = [
    "在 Civ6 左上副官入口打开「战情简报」，点击「更新战情」。",
    "看到“简报已汇总，可继续由AI副官分析。”后重新获取当前游戏上下文。"
  ];
  if (refresh.mode === "bridge") {
    actions.unshift(`确认 Civ6 日志可由本地工具读取：${paths.luaLogPath}`);
  }
  return actions;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integer(value: unknown): number | undefined {
  return Number.isInteger(value) ? Number(value) : undefined;
}
