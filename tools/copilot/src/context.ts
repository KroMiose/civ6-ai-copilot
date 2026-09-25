import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildCiv6AICopilotPaths, type Civ6AICopilotPaths } from "../../paths/src/civ6-paths.js";
import { renderSnapshotMapToFile } from "../../render-map/src/render-map.js";
import { COMPAT_VERSION, compatFromVersion } from "../../project/src/version.js";
import { validateSnapshotObject } from "../../snapshot/src/validate.js";
import { adjacentOwnUnits } from "./adjacent-units.js";
import {
  runCopilotRefresh,
  type CopilotPrepareOptions,
  type CopilotRefreshReport
} from "./prepare.js";

export type CopilotContextStatus = "ready" | "needs-game-refresh" | "runtime-error";

export interface CopilotContextOptions extends Omit<CopilotPrepareOptions, "handoffDir" | "clean" | "includeSnapshot" | "renderMap" | "intents" | "requiredModules" | "maxAgeMinutes"> {
  modules?: string[];
  adjacentUnits?: boolean;
  renderMapPath?: string;
}

export interface CopilotContextReport {
  contractVersion: "1";
  status: CopilotContextStatus;
  readyForCopilot: boolean;
  exitCode: number;
  generatedAt: string;
  query?: string;
  modules: string[];
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
  refresh: {
    mode: CopilotRefreshReport["mode"];
    attempted: boolean;
    ok: boolean;
    reused: boolean;
    exportId?: string;
  };
  diagnostics?: {
    issues: string[];
    warnings: string[];
  };
  gaps: string[];
  context?: Record<string, unknown>;
  artifacts?: {
    visibleMap?: {
      path: string;
      tiles: number;
    };
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

const KNOWN_MODULES = Object.keys(MODULE_TO_KEYS);
const DOMAIN_MODULES = new Set(["governors", "trade", "cityStates"]);

export async function runCopilotContext(options: CopilotContextOptions = {}): Promise<CopilotContextReport> {
  const modules = normalizeModules(options.modules);
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
    requiredModules: modules
  });

  await mkdir(paths.snapshotDir, { recursive: true });
  const refresh = await runCopilotRefresh(paths, options);
  if (refresh.attempted && !refresh.ok) {
    const status = noCompletedExport(refreshText(refresh)) ? "needs-game-refresh" : "runtime-error";
    return incomplete(status, options.question, modules, refresh, [refreshText(refresh)], refreshActions(status, refresh, paths));
  }

  const latestPath = path.join(paths.snapshotDir, "latest.json");
  let snapshotText = "";
  try {
    snapshotText = await readFile(latestPath, "utf8");
  } catch {
    return incomplete(
      "needs-game-refresh",
      options.question,
      modules,
      refresh,
      ["游戏里还没有一份写完的战情导出。"],
      [
        "在 Civ6 左上副官入口打开「战情简报」，点击「更新战情」。",
        "看到“简报已汇总，可继续由AI副官分析。”后，再用同样的模块重新获取。"
      ]
    );
  }

  let snapshot: Record<string, any>;
  try {
    snapshot = JSON.parse(snapshotText) as Record<string, any>;
  } catch (error) {
    return incomplete("runtime-error", options.question, modules, refresh, [`latest.json 不是有效 JSON：${(error as Error).message}`], [
      "重新点击「更新战情」，待面板显示已汇总后再获取。"
    ]);
  }

  const validation = await validateSnapshotObject(snapshot);
  if (!validation.ok) {
    return incomplete("runtime-error", options.question, modules, refresh, [
      ...validation.schemaErrors,
      ...validation.fairnessIssues.map((issue) => `${issue.path} ${issue.message}`)
    ], ["这次导出未通过可见性或结构校验，不要基于它给出对局建议。"]);
  }

  const compatIssue = incompatibleCompat(snapshot);
  if (compatIssue) {
    return incomplete("runtime-error", options.question, modules, refresh, [compatIssue], [
      "升级 civ6-ai-copilot Mod 和本地工具，使二者的 major.minor 版本一致后再汇总。"
    ]);
  }

  const manifest = await readManifest(paths.snapshotDir, snapshotText, snapshot);
  if (manifest.issues.length > 0) {
    return incomplete("runtime-error", options.question, modules, refresh, manifest.issues, [
      "当前战情文件和 manifest 不一致。重新点击「更新战情」后再获取。"
    ]);
  }

  const unknown = modules.filter((name) => !KNOWN_MODULES.includes(name));
  const selected = (modules.length > 0 ? modules.filter((name) => KNOWN_MODULES.includes(name)) : modulesInSnapshot(snapshot));
  const context = projectSnapshot(snapshot, selected);
  const gaps = [
    ...selected.flatMap((name) => unavailableGap(snapshot, name)),
    ...unknown.map((name) => `未知模块 ${name}，未列入本次上下文。`),
    ...selected.filter((name) => !moduleInExport(snapshot, name)).map((name) => `${name} 不在这次导出中。`)
  ];

  if (options.adjacentUnits) {
    context.adjacentUnits = adjacentOwnUnits(snapshot);
  }

  let artifacts: CopilotContextReport["artifacts"];
  const warnings = [...manifest.warnings];
  if (options.renderMapPath) {
    try {
      await mkdir(path.dirname(options.renderMapPath), { recursive: true });
      const rendered = await renderSnapshotMapToFile(latestPath, options.renderMapPath);
      artifacts = { visibleMap: { path: options.renderMapPath, tiles: rendered.counts.tiles } };
    } catch (error) {
      warnings.push(`visible-map.svg 渲染失败：${(error as Error).message}`);
    }
  }

  return {
    contractVersion: "1",
    status: "ready",
    readyForCopilot: true,
    exitCode: 0,
    generatedAt: new Date().toISOString(),
    query: options.question,
    modules: selected,
    identity: identityOf(snapshot),
    refresh: compactRefresh(refresh),
    diagnostics: { issues: [], warnings },
    gaps,
    context,
    artifacts,
    userActions: []
  };
}

function projectSnapshot(snapshot: Record<string, any>, modules: string[]): Record<string, unknown> {
  const keys = new Set<string>(["schemaVersion", "exportedAt", "source", "session", "localPlayer"]);
  for (const moduleName of modules) {
    for (const key of MODULE_TO_KEYS[moduleName] ?? []) keys.add(key);
  }
  const projected: Record<string, unknown> = {};
  for (const key of keys) {
    if (snapshot[key] !== undefined) projected[key] = snapshot[key];
  }
  if (snapshot.moduleStatus && typeof snapshot.moduleStatus === "object") {
    const relevant = new Set(modules);
    projected.moduleStatus = Object.fromEntries(
      Object.entries(snapshot.moduleStatus).filter(([name]) => relevant.has(name))
    );
  }
  if (Array.isArray(snapshot.modules)) {
    projected.modules = snapshot.modules.filter((name: string) => modules.includes(name));
  }
  return projected;
}

function modulesInSnapshot(snapshot: Record<string, any>): string[] {
  const declared = Array.isArray(snapshot.modules) ? snapshot.modules.filter((name: unknown): name is string => typeof name === "string") : [];
  const knownDeclared = declared.filter((name) => KNOWN_MODULES.includes(name));
  return knownDeclared.length > 0 ? knownDeclared : KNOWN_MODULES.filter((name) => moduleInExport(snapshot, name));
}

function moduleInExport(snapshot: Record<string, any>, moduleName: string): boolean {
  if (Array.isArray(snapshot.modules) && snapshot.modules.includes(moduleName)) return true;
  return (MODULE_TO_KEYS[moduleName] ?? []).some((key) => snapshot[key] !== undefined);
}

function unavailableGap(snapshot: Record<string, any>, moduleName: string): string[] {
  if (!DOMAIN_MODULES.has(moduleName)) return [];
  const field = MODULE_TO_KEYS[moduleName]?.[0];
  const value = field ? snapshot[field] : undefined;
  if (!value || typeof value !== "object" || (value as { availability?: unknown }).availability !== "unavailable") return [];
  return [`${moduleName} 本次不可用，不能当成没有该对象。`];
}

function incomplete(
  status: Exclude<CopilotContextStatus, "ready">,
  query: string | undefined,
  modules: string[],
  refresh: CopilotRefreshReport,
  issues: string[],
  userActions: string[]
): CopilotContextReport {
  return {
    contractVersion: "1",
    status,
    readyForCopilot: false,
    exitCode: status === "needs-game-refresh" ? 2 : 1,
    generatedAt: new Date().toISOString(),
    query,
    modules,
    refresh: compactRefresh(refresh),
    diagnostics: { issues, warnings: [] },
    gaps: [],
    userActions
  };
}

function identityOf(snapshot: Record<string, any>): CopilotContextReport["identity"] {
  return {
    exportId: text(snapshot.source?.exportId),
    sessionId: text(snapshot.session?.sessionId),
    gameTurn: Number.isInteger(snapshot.session?.gameTurn) ? snapshot.session.gameTurn : undefined,
    exportedAt: text(snapshot.exportedAt),
    modVersion: text(snapshot.source?.modVersion),
    compatVersion: text(snapshot.source?.compatVersion),
    protocolVersion: text(snapshot.source?.protocolVersion),
    schemaVersion: text(snapshot.schemaVersion)
  };
}

function incompatibleCompat(snapshot: Record<string, any>): string | undefined {
  const declared = text(snapshot.source?.compatVersion);
  const inferred = text(snapshot.source?.modVersion) ? compatFromVersion(String(snapshot.source.modVersion)) : undefined;
  const snapshotCompat = declared ?? inferred;
  if (!snapshotCompat) return "snapshot 未提供 source.compatVersion，且无法从 source.modVersion 推导兼容版本。";
  if (snapshotCompat !== COMPAT_VERSION) {
    return `snapshot 兼容版本是 ${snapshotCompat}，当前工具需要 ${COMPAT_VERSION}。`;
  }
  return undefined;
}

async function readManifest(
  snapshotDir: string,
  snapshotText: string,
  snapshot: Record<string, any>
): Promise<{ issues: string[]; warnings: string[] }> {
  const manifestPath = path.join(snapshotDir, "latest-manifest.json");
  let manifestText = "";
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    return { issues: [], warnings: ["没有找到 latest-manifest.json；继续使用这次导出。"] };
  }
  let manifest: { exportId?: unknown; checksumSha256?: unknown; checksumScope?: unknown };
  try {
    manifest = JSON.parse(manifestText) as typeof manifest;
  } catch (error) {
    return { issues: [`latest-manifest.json 不是有效 JSON：${(error as Error).message}`], warnings: [] };
  }
  const issues: string[] = [];
  const checksum = createHash("sha256").update(Buffer.from(snapshotText, "utf8")).digest("hex");
  if (manifest.checksumScope !== "latest-json-file") issues.push("latest-manifest.json 的 checksumScope 不是 latest-json-file。");
  if (manifest.checksumSha256 !== checksum) issues.push("latest-manifest.json checksumSha256 与 latest.json 内容不一致。");
  if (typeof manifest.exportId === "string" && text(snapshot.source?.exportId) && manifest.exportId !== snapshot.source.exportId) {
    issues.push("latest-manifest.json exportId 与 snapshot.source.exportId 不一致。");
  }
  return { issues, warnings: [] };
}

function compactRefresh(refresh: CopilotRefreshReport): CopilotContextReport["refresh"] {
  const result = refresh.result;
  return {
    mode: refresh.mode,
    attempted: refresh.attempted,
    ok: refresh.ok,
    reused: Boolean(result && "skipped" in result && result.skipped),
    exportId: result && "exportId" in result ? result.exportId : undefined
  };
}

function refreshText(refresh: CopilotRefreshReport): string {
  const result = refresh.result;
  if (result && "error" in result && result.error) return result.error;
  return refresh.summary;
}

function noCompletedExport(text: string): boolean {
  return /no-cached-export|No complete civ6-ai-copilot snapshot|没有找到 snapshot/i.test(text);
}

function refreshActions(
  status: Exclude<CopilotContextStatus, "ready">,
  refresh: CopilotRefreshReport,
  paths: Civ6AICopilotPaths
): string[] {
  if (status === "needs-game-refresh") {
    return [
      "在 Civ6 左上副官入口打开「战情简报」，点击「更新战情」。",
      "看到“简报已汇总，可继续由AI副官分析。”后，再用同样的模块重新获取。"
    ];
  }
  const where = refresh.mode === "bridge" ? `日志：${paths.luaLogPath}` : "Tuner 连接";
  return [`读取当前战情失败（${where}）：${refreshText(refresh)}`, "确认游戏正在运行，并且本机工具可以读取日志或 Tuner。"];
}

function normalizeModules(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
