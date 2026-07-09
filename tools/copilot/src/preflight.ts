import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { summarizeSnapshotObject, type SnapshotLike, type SnapshotSummary } from "./summarize-snapshot.js";
import { COMPAT_VERSION, MOD_ID, VERSION, compatFromVersion } from "../../project/src/version.js";

const DEFAULT_MAX_AGE_MINUTES = 30;

export interface CopilotPreflightOptions {
  snapshotPath?: string;
  snapshotDir?: string;
  question?: string;
  intents?: string[];
  requiredModules?: string[];
  maxAgeMinutes?: number;
}

export interface CopilotPreflightReport {
  ok: boolean;
  canAnalyze: boolean;
  exitCode: number;
  snapshotPath?: string;
  manifestPath?: string;
  question?: string;
  intents: string[];
  requiredModules: string[];
  checks: {
    snapshotFound: boolean;
    manifestFound: boolean;
    manifestConsistent?: boolean;
    validationOk: boolean;
    fairnessOk: boolean;
    compatibilityOk: boolean;
    syncOk: boolean;
    freshnessOk: boolean;
  };
  summary?: SnapshotSummary;
  issues: string[];
  warnings: string[];
  nextActions: string[];
}

interface LatestManifest {
  exportId?: unknown;
  checksumSha256?: unknown;
  writtenAt?: unknown;
}

export async function runCopilotPreflight(options: CopilotPreflightOptions = {}): Promise<CopilotPreflightReport> {
  const snapshotPath = resolveSnapshotPath(options);
  const question = options.question;
  const commandIntentArgs = buildCopilotCommandArgs(options);
  const issues: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (!snapshotPath) {
    return {
      ok: false,
      canAnalyze: false,
      exitCode: 1,
      question,
      intents: normalizedList(options.intents),
      requiredModules: normalizedList(options.requiredModules),
      checks: emptyChecks(),
      issues: ["没有找到 snapshot。"],
      warnings,
      nextActions: [
        "在 Civ6 点击左上副官入口，打开「战情简报」，点击「汇总本回合」，看到“简报已汇总，可继续由AI副官分析。”和“最近汇总：…”后等待 latest.json 更新。",
        `重新运行标准入口：npm run copilot -- ${commandIntentArgs} --clean`
      ]
    };
  }

  let snapshotText = "";
  let snapshot: SnapshotLike;
  try {
    snapshotText = await readFile(snapshotPath, "utf8");
    snapshot = JSON.parse(snapshotText) as SnapshotLike;
  } catch (error) {
    return {
      ok: false,
      canAnalyze: false,
      exitCode: 1,
      snapshotPath,
      question,
      intents: normalizedList(options.intents),
      requiredModules: normalizedList(options.requiredModules),
      checks: emptyChecks({ snapshotFound: false }),
      issues: [`无法读取或解析 snapshot：${(error as Error).message}`],
      warnings,
      nextActions: ["重新运行 bridge 或 tuner-bridge，确认 latest.json 是完整 JSON 后再分析。"]
    };
  }

  const manifestPath = path.join(path.dirname(snapshotPath), "latest-manifest.json");
  const manifestCheck = await checkManifest(manifestPath, snapshotText, snapshot);
  warnings.push(...manifestCheck.warnings);
  issues.push(...manifestCheck.issues);

  const compatibility = checkCompatibility(snapshot);
  warnings.push(...compatibility.warnings);
  issues.push(...compatibility.issues);
  nextActions.push(...compatibility.nextActions);

  const summary = await summarizeSnapshotObject(snapshot, {
    question,
    intents: options.intents,
    requiredModules: options.requiredModules,
    allowInvalid: true
  });
  if (!summary.validation.ok) {
    issues.push("snapshot 未通过 schema 或多人公平校验。");
    nextActions.push("先运行 npm run validate -- \"<snapshot>\" 查看 schemaErrors/fairnessIssues，并重新汇总情报或修正导出器。");
  }

  const freshness = checkFreshness(snapshot.exportedAt, options.maxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES);
  warnings.push(...freshness.warnings);
  issues.push(...freshness.issues);

  if (!summary.syncAdvice.ok) {
    nextActions.push(summary.syncAdvice.recommendation);
  }

  if (summary.syncAdvice.ok && summary.validation.ok && freshness.ok && compatibility.ok && manifestCheck.consistent !== false) {
    nextActions.push("当前 snapshot 已可用于回答；地图/战争/海军/定居问题可额外运行 render-map 生成玩家可见 hex map。");
  }

  const hardOk = summary.validation.ok && freshness.ok && compatibility.ok && manifestCheck.consistent !== false;
  const canAnalyze = hardOk && summary.syncAdvice.ok;
  const exitCode = canAnalyze ? 0 : hardOk ? 2 : 1;

  return {
    ok: canAnalyze,
    canAnalyze,
    exitCode,
    snapshotPath,
    manifestPath,
    question,
    intents: summary.syncAdvice.intents,
    requiredModules: summary.syncAdvice.requiredModules,
    checks: {
      snapshotFound: true,
      manifestFound: manifestCheck.found,
      manifestConsistent: manifestCheck.consistent,
      validationOk: summary.validation.schemaOk,
      fairnessOk: summary.validation.fairnessOk,
      compatibilityOk: compatibility.ok,
      syncOk: summary.syncAdvice.ok,
      freshnessOk: freshness.ok
    },
    summary,
    issues,
    warnings,
    nextActions
  };
}

export function formatCopilotPreflightMarkdown(report: CopilotPreflightReport): string {
  const lines = [
    "# Civ6 AI Copilot Preflight",
    "",
    `- 状态：${report.canAnalyze ? "可以分析" : report.exitCode === 2 ? "需要先更新情报" : "不可分析"}`,
    `- snapshot：${report.snapshotPath ?? "未找到"}`,
    `- manifest：${report.checks.manifestFound ? "已找到" : "未找到"}`,
    `- 校验：schema ${report.checks.validationOk ? "通过" : "失败"}，fairness ${report.checks.fairnessOk ? "通过" : "失败"}`,
    `- 兼容：${report.checks.compatibilityOk ? "通过" : "失败"}`,
    `- 情报：${report.checks.syncOk ? "覆盖当前意图" : "当前意图所需情报未覆盖"}`,
    `- 新鲜度：${report.checks.freshnessOk ? "通过" : "失败"}`,
    ""
  ];

  if (report.summary) {
    lines.push(
      "## 快照",
      `- 第 ${report.summary.snapshot.gameTurn} 回合，${report.summary.snapshot.visibilityMode}，导出类型 ${report.summary.snapshot.exportType}`,
      `- 本地玩家：${report.summary.localPlayer.leaderType} / ${report.summary.localPlayer.civilizationType}`,
      `- 分析意图：${report.summary.syncAdvice.intents.join("、") || "通用局势"}`,
      `- 模块：${report.summary.coverage.availableModules.join("、") || "无"}`,
      `- 情报建议：${report.summary.syncAdvice.recommendation}`,
      ""
    );
  }

  if (report.issues.length > 0) {
    lines.push("## 阻塞", ...report.issues.map((issue) => `- ${issue}`), "");
  }

  if (report.warnings.length > 0) {
    lines.push("## 提醒", ...report.warnings.map((warning) => `- ${warning}`), "");
  }

  lines.push("## 下一步", ...report.nextActions.map((action) => `- ${action}`));
  return `${lines.join("\n")}\n`;
}

function buildCopilotCommandArgs(options: CopilotPreflightOptions): string {
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

function checkCompatibility(snapshot: SnapshotLike): { ok: boolean; issues: string[]; warnings: string[]; nextActions: string[] } {
  const source = snapshot.source;
  const issues: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];
  const modId = source?.modId;
  const modVersion = source?.modVersion;
  const declaredCompat = source?.compatVersion;
  const inferredCompat = typeof modVersion === "string" ? compatFromVersion(modVersion) : undefined;
  const snapshotCompat = typeof declaredCompat === "string" ? declaredCompat : inferredCompat;

  if (modId !== MOD_ID) {
    issues.push(`snapshot.source.modId=${String(modId ?? "未提供")}，当前工具只支持 ${MOD_ID}。`);
  }

  if (!snapshotCompat) {
    issues.push("snapshot 未提供 source.compatVersion，且无法从 source.modVersion 推导兼容版本。");
  } else if (snapshotCompat !== COMPAT_VERSION) {
    issues.push(`snapshot 兼容版本是 ${snapshotCompat}，当前 skill/tool 需要 ${COMPAT_VERSION}；请升级 Mod 或 skill 后重新汇总。`);
    nextActions.push("升级 civ6-ai-copilot Mod 和 skill，使二者的 major.minor 版本一致，再在战情简报重新汇总本回合。");
  }

  if (snapshotCompat === COMPAT_VERSION && typeof modVersion === "string" && modVersion !== VERSION) {
    warnings.push(`Mod 版本是 ${modVersion}，当前 skill/tool 是 ${VERSION}；major.minor 兼容，可继续分析，建议有空更新到同一 patch。`);
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    nextActions
  };
}

function resolveSnapshotPath(options: CopilotPreflightOptions): string | undefined {
  if (options.snapshotPath) {
    return path.resolve(options.snapshotPath);
  }

  const snapshotDir = options.snapshotDir ?? process.env.CIV6_AI_COPILOT_SNAPSHOT_DIR;
  if (snapshotDir) {
    return path.join(path.resolve(snapshotDir), "latest.json");
  }

  return undefined;
}

async function checkManifest(
  manifestPath: string,
  snapshotText: string,
  snapshot: SnapshotLike
): Promise<{ found: boolean; consistent?: boolean; issues: string[]; warnings: string[] }> {
  let manifestText = "";
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    return {
      found: false,
      consistent: undefined,
      issues: [],
      warnings: ["没有找到 latest-manifest.json；可以继续分析，但无法确认 latest.json 是否来自完整 bridge 写入。"]
    };
  }

  let manifest: LatestManifest;
  try {
    manifest = JSON.parse(manifestText) as LatestManifest;
  } catch (error) {
    return {
      found: true,
      consistent: false,
      issues: [`latest-manifest.json 不是有效 JSON：${(error as Error).message}`],
      warnings: []
    };
  }

  const issues: string[] = [];
  const warnings: string[] = [];
  const snapshotChecksum = createHash("sha256").update(Buffer.from(snapshotText, "utf8")).digest("hex");

  if (typeof manifest.checksumSha256 !== "string") {
    issues.push("latest-manifest.json 未提供 checksumSha256。");
  } else if (manifest.checksumSha256 !== snapshotChecksum) {
    issues.push("latest-manifest.json checksumSha256 与 latest.json 内容不一致。");
  }

  const snapshotExportId = typeof snapshot.source?.exportId === "string" ? snapshot.source.exportId : undefined;
  if (typeof manifest.exportId !== "string") {
    issues.push("latest-manifest.json 未提供 exportId。");
  } else if (snapshotExportId && manifest.exportId !== snapshotExportId) {
    issues.push("latest-manifest.json exportId 与 snapshot.source.exportId 不一致。");
  }

  if (typeof manifest.writtenAt !== "string") {
    warnings.push("latest-manifest.json 未提供 writtenAt；无法判断 bridge 写入时间。");
  }

  return {
    found: true,
    consistent: issues.length === 0,
    issues,
    warnings
  };
}

function checkFreshness(exportedAt: unknown, maxAgeMinutes?: number): { ok: boolean; issues: string[]; warnings: string[] } {
  if (maxAgeMinutes === undefined) {
    return { ok: true, issues: [], warnings: [] };
  }

  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0) {
    return { ok: false, issues: ["maxAgeMinutes 必须是正数。"], warnings: [] };
  }

  if (typeof exportedAt !== "string") {
    return { ok: false, issues: ["snapshot.exportedAt 未提供，无法确认新鲜度。"], warnings: [] };
  }

  const timestamp = Date.parse(exportedAt);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, issues: ["snapshot.exportedAt 不是有效时间。"], warnings: [] };
  }

  const ageMinutes = (Date.now() - timestamp) / 60000;
  if (ageMinutes > maxAgeMinutes) {
    return {
      ok: false,
      issues: [`snapshot 已超过 ${maxAgeMinutes} 分钟；请在战情简报重新汇总本回合。`],
      warnings: []
    };
  }

  if (ageMinutes < -5) {
    return {
      ok: true,
      issues: [],
      warnings: ["snapshot.exportedAt 晚于当前系统时间；请确认 Windows 和 Mac 时钟是否一致。"]
    };
  }

  return { ok: true, issues: [], warnings: [] };
}

function emptyChecks(overrides: Partial<CopilotPreflightReport["checks"]> = {}): CopilotPreflightReport["checks"] {
  return {
    snapshotFound: false,
    manifestFound: false,
    validationOk: false,
    fairnessOk: false,
    compatibilityOk: false,
    syncOk: false,
    freshnessOk: false,
    ...overrides
  };
}
