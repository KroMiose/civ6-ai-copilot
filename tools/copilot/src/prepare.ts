import { mkdir, readFile, rm } from "node:fs/promises";
import { runBridgeOnce, type BridgeRunResult } from "../../bridge/src/bridge.js";
import { buildCiv6AICopilotPaths, type Civ6AICopilotPaths, type Civ6PathPlatform } from "../../paths/src/civ6-paths.js";
import { LUA_STATE_NAME } from "../../project/src/version.js";
import { runTunerBridgeOnce, type TunerBridgeResult } from "../../tuner-bridge/src/tuner-bridge.js";
import { formatCopilotHandoffMarkdown, runCopilotHandoff, type CopilotHandoffReport } from "./handoff.js";

export type CopilotRefreshMode = "auto" | "tuner" | "bridge" | "none";
export type ResolvedCopilotRefreshMode = Exclude<CopilotRefreshMode, "auto">;

export interface CopilotPrepareOptions {
  question?: string;
  intents?: string[];
  requiredModules?: string[];
  platform?: Civ6PathPlatform;
  homeDir?: string;
  civ6UserDataDir?: string;
  modsDir?: string;
  logsDir?: string;
  luaLogPath?: string;
  codexHome?: string;
  snapshotDir?: string;
  handoffDir?: string;
  refreshMode?: CopilotRefreshMode;
  clean?: boolean;
  maxAgeMinutes?: number;
  includeSnapshot?: boolean;
  renderMap?: boolean;
  host?: string;
  port?: number;
  state?: string;
  timeoutMs?: number;
  allowInvalid?: boolean;
}

export interface CopilotRefreshReport {
  requestedMode: CopilotRefreshMode;
  mode: ResolvedCopilotRefreshMode;
  attempted: boolean;
  ok: boolean;
  exitCode: number;
  summary: string;
  result?: BridgeRunResult | TunerBridgeResult;
}

export interface CopilotPrepareReport {
  ok: boolean;
  readyForCopilot: boolean;
  exitCode: number;
  generatedAt: string;
  question?: string;
  intents: string[];
  requiredModules: string[];
  paths: Civ6AICopilotPaths;
  refresh: CopilotRefreshReport;
  handoff?: CopilotHandoffReport;
  nextActions: string[];
}

export async function runCopilotPrepare(options: CopilotPrepareOptions = {}): Promise<CopilotPrepareReport> {
  const paths = buildCiv6AICopilotPaths({
    platform: options.platform,
    homeDir: options.homeDir,
    civ6UserDataDir: options.civ6UserDataDir,
    modsDir: options.modsDir,
    logsDir: options.logsDir,
    luaLogPath: options.luaLogPath,
    codexHome: options.codexHome,
    snapshotDir: options.snapshotDir,
    handoffDir: options.handoffDir,
    question: options.question,
    intents: options.intents,
    requiredModules: options.requiredModules
  });

  await mkdir(paths.snapshotDir, { recursive: true });
  if (options.clean) {
    // Invalidate old handoff artifacts before attempting a new refresh. A failed refresh
    // must never leave a previous "ready" handoff looking current.
    await rm(paths.handoffDir, { recursive: true, force: true });
  }
  await mkdir(paths.handoffDir, { recursive: true });

  const refresh = await runCopilotRefresh(paths, options);
  if (refresh.attempted && !refresh.ok) {
    const nextActions = refreshNextActions(refresh, paths, options);
    return {
      ok: false,
      readyForCopilot: false,
      exitCode: refresh.exitCode,
      generatedAt: new Date().toISOString(),
      question: options.question,
      intents: normalizedList(options.intents),
      requiredModules: normalizedList(options.requiredModules),
      paths,
      refresh,
      nextActions
    };
  }

  const handoff = await runCopilotHandoff({
    snapshotDir: paths.snapshotDir,
    outputDir: paths.handoffDir,
    question: options.question,
    intents: options.intents,
    requiredModules: options.requiredModules,
    maxAgeMinutes: options.maxAgeMinutes,
    clean: options.clean,
    includeSnapshot: options.includeSnapshot,
    renderMap: options.renderMap
  });

  return {
    ok: handoff.readyForCopilot,
    readyForCopilot: handoff.readyForCopilot,
    exitCode: handoff.exitCode,
    generatedAt: new Date().toISOString(),
    question: options.question,
    intents: handoff.intents,
    requiredModules: handoff.requiredModules,
    paths,
    refresh,
    handoff,
    nextActions: handoff.readyForCopilot
      ? [`读取 ${handoff.codexPromptPath}，按 handoff 中列出的文件完成分析。`]
      : handoff.preflight.nextActions
  };
}

export function formatCopilotPrepareMarkdown(report: CopilotPrepareReport): string {
  const status = report.readyForCopilot ? "可以分析" : report.refresh.attempted && !report.refresh.ok ? "需要重新汇总" : "需要更新情报";
  const lines = [
    "# Civ6 AI Copilot",
    "",
    `- 状态：${status}`,
    `- 分析意图：${report.intents.join("、") || "通用局势"}`,
    `- 备注：${report.question ?? "未指定"}`,
    `- snapshot：${report.paths.snapshotDir}`,
    `- handoff：${report.paths.handoffDir}`,
    "",
    "## 标准入口",
    `- 取数方式：${report.refresh.mode}`,
    `- 取数结果：${report.refresh.summary}`,
    ""
  ];

  if (report.handoff) {
    lines.push("## Handoff", "");
    lines.push(formatCopilotHandoffMarkdown(report.handoff).trimEnd(), "");
  }

  lines.push("## 下一步", ...report.nextActions.map((action) => `- ${action}`));
  return `${lines.join("\n")}\n`;
}

export async function runCopilotRefresh(paths: Civ6AICopilotPaths, options: CopilotPrepareOptions): Promise<CopilotRefreshReport> {
  const requestedMode = options.refreshMode ?? "auto";
  const mode = resolveRefreshMode(requestedMode, paths.platform);

  if (mode === "none") {
    return {
      requestedMode,
      mode,
      attempted: false,
      ok: true,
      exitCode: 0,
      summary: "已使用现有 snapshot 目录。"
    };
  }

  const currentExportId = await readCurrentExportId(paths.snapshotDir);

  if (mode === "tuner") {
    const result = await runTunerBridgeOnce({
      outputDir: paths.snapshotDir,
      host: options.host,
      ports: options.port ? [options.port] : undefined,
      state: options.state ?? LUA_STATE_NAME,
      timeoutMs: options.timeoutMs,
      allowInvalid: options.allowInvalid,
      skipExportId: currentExportId
    });
    return {
      requestedMode,
      mode,
      attempted: true,
      ok: result.ok,
      exitCode: result.exitCode,
      summary: summarizeRefreshResult(result),
      result
    };
  }

  const result = await runBridgeOnce({
    inputLog: paths.luaLogPath,
    outputDir: paths.snapshotDir,
    allowInvalid: options.allowInvalid,
    skipExportId: currentExportId
  });
  return {
    requestedMode,
    mode,
    attempted: true,
    ok: result.ok,
    exitCode: result.exitCode,
    summary: summarizeRefreshResult(result),
    result
  };
}

function resolveRefreshMode(mode: CopilotRefreshMode, platform: Civ6PathPlatform): ResolvedCopilotRefreshMode {
  if (mode !== "auto") {
    return mode;
  }
  return platform === "darwin" ? "tuner" : "bridge";
}

function summarizeRefreshResult(result: BridgeRunResult | TunerBridgeResult): string {
  if (result.ok && "exportId" in result) {
    if ("skipped" in result && result.skipped) {
      return `已是最新导出 ${result.exportId}。`;
    }
    return `已写入导出 ${result.exportId}。`;
  }
  if (result.ok && "diagnoseOnly" in result) {
    return "诊断完成。";
  }
  if (!result.ok && "error" in result) {
    return result.error;
  }
  return result.ok ? "完成。" : "未能完成取数。";
}

function refreshNextActions(refresh: CopilotRefreshReport, paths: Civ6AICopilotPaths, options: CopilotPrepareOptions): string[] {
  const rerun = `npm run copilot -- ${buildCopilotCommandArgs(options)}`;
  if (refresh.mode === "tuner") {
    return [
      "在 Civ6 左上打开「战情简报」，点击「更新战情」。",
      "面板显示“简报已汇总，可继续由AI副官分析。”后，回到终端重新运行标准入口。",
      rerun
    ];
  }

  return [
    `保持 bridge 读取 ${paths.luaLogPath} 并输出到 ${paths.snapshotDir}。`,
    "在 Civ6 左上打开「战情简报」，点击「更新战情」。",
    "面板显示“简报已汇总，可继续由AI副官分析。”后，重新运行标准入口。",
    rerun
  ];
}

function buildCopilotCommandArgs(options: CopilotPrepareOptions): string {
  const intents = normalizedList(options.intents);
  const modules = normalizedList(options.requiredModules);
  const stableIntents = intents.length > 0 ? intents : ["turn-priority"];
  return [
    ...stableIntents.flatMap((intent) => ["--intent", JSON.stringify(intent)]),
    ...modules.flatMap((moduleName) => ["--module", JSON.stringify(moduleName)])
  ].join(" ");
}

function normalizedList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

async function readCurrentExportId(snapshotDir: string): Promise<string | undefined> {
  try {
    const manifest = JSON.parse(await readFile(`${snapshotDir}/latest-manifest.json`, "utf8")) as { exportId?: unknown };
    return typeof manifest.exportId === "string" && manifest.exportId.length > 0 ? manifest.exportId : undefined;
  } catch {
    return undefined;
  }
}
