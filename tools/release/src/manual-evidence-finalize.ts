import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateManualEvidenceObject, type ManualEvidenceValidationResult } from "./manual-evidence.js";

export interface ManualEvidenceFinalizeOptions {
  inputPath: string;
  outputPath?: string;
  confirmWindowsSmoke?: boolean;
  confirmMultiplayerFairness?: boolean;
  confirmMacCodexCopilot?: boolean;
  confirmArtifactScope?: boolean;
  civ6Build?: string;
  ruleset?: string;
  modVersion?: string;
  notes?: string;
}

export interface ManualEvidenceFinalizeReport {
  ok: boolean;
  inputPath: string;
  outputPath?: string;
  generatedAt: string;
  evidence: Record<string, unknown>;
  validation: ManualEvidenceValidationResult;
  missingConfirmations: string[];
  nextActions: string[];
}

const windowsManualFlags = [
  "modEnabledInAdditionalContent",
  "releaseManifestValidated",
  "copilotButtonVisible",
  "localizedTextOk",
  "selectiveSyncExported",
  "noGameplayMutationObserved"
];

const multiplayerManualFlags = [
  "bothEnabledMod",
  "separateSnapshotDirs",
  "noDesyncObserved",
  "copilotUsesLocalVisibilityNotice"
];

const playerManualFlags = [
  "localPlayerVerified",
  "ownCitiesOnly",
  "ownUnitsOnlyExceptVisibleForeign",
  "visibleForeignUnitsAreVisibleNow",
  "noHiddenMap",
  "noInvisibleForeignUnits",
  "noUnmetPlayers",
  "noOtherPlayerTechCivicsPolicies",
  "renderMapVisibleOnly"
];

const macCodexManualFlags = [
  "skillInstalledValidated",
  "handoffGenerated",
  "codexPromptReadFirst",
  "copilotHandoffRead",
  "snapshotValidatedOnCopilotMachine",
  "localVisibilityNoticeShown",
  "syncBlockerHonored",
  "noBlindAnalysisWhenSyncRequired",
  "handoffScopeHonored"
];

export async function finalizeManualEvidence(
  options: ManualEvidenceFinalizeOptions
): Promise<ManualEvidenceFinalizeReport> {
  const inputPath = path.resolve(options.inputPath);
  const evidence = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, unknown>;
  const missingConfirmations = collectMissingConfirmations(options);
  const generatedAt = new Date().toISOString();

  if (missingConfirmations.length === 0) {
    applyFinalManualConfirmations(evidence, {
      generatedAt,
      civ6Build: options.civ6Build,
      ruleset: options.ruleset,
      modVersion: options.modVersion,
      notes: options.notes
    });
  }

  const validation = await validateManualEvidenceObject(evidence);
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : undefined;
  const ok = missingConfirmations.length === 0 && validation.ok;
  const report: ManualEvidenceFinalizeReport = {
    ok,
    inputPath,
    outputPath: missingConfirmations.length === 0 ? outputPath : undefined,
    generatedAt,
    evidence,
    validation,
    missingConfirmations,
    nextActions: buildNextActions(missingConfirmations, validation, outputPath)
  };

  if (report.outputPath) {
    await mkdir(path.dirname(report.outputPath), { recursive: true });
    await writeFile(report.outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  return report;
}

export function formatManualEvidenceFinalizeMarkdown(report: ManualEvidenceFinalizeReport): string {
  const lines = [
    "# civ6-ai-copilot Manual Evidence Finalize",
    "",
    `- 总状态：${report.ok ? "通过" : "失败"}`,
    `- 输入：${report.inputPath}`,
    `- 输出：${report.outputPath ?? "未写入"}`,
    `- schema：${report.validation.schemaOk ? "通过" : "失败"}`,
    `- 发布材料边界：${report.validation.artifactScopeOk ? "通过" : "失败"}`,
    `- 真实测试标记：${report.validation.realEvidence ? "通过" : "失败"}`,
    `- Windows gate：${report.validation.gates.windowsCiv6Load ? "通过" : "失败"}`,
    `- 多人公平 gate：${report.validation.gates.multiplayerFairness ? "通过" : "失败"}`,
    `- Mac Codex 副官 gate：${report.validation.gates.macCodexCopilot ? "通过" : "失败"}`,
    `- 生成时间：${report.generatedAt}`
  ];

  appendList(lines, "缺少显式确认", report.missingConfirmations);
  appendList(lines, "Schema 问题", report.validation.schemaErrors);
  appendList(lines, "发布材料问题", report.validation.artifactScopeIssues);
  appendList(lines, "策略问题", report.validation.policyIssues);
  appendList(lines, "警告", report.validation.warnings);
  appendList(lines, "下一步", report.nextActions);

  return `${lines.join("\n")}\n`;
}

function applyFinalManualConfirmations(
  evidence: Record<string, unknown>,
  options: {
    generatedAt: string;
    civ6Build?: string;
    ruleset?: string;
    modVersion?: string;
    notes?: string;
  }
): void {
  const windowsSmoke = ensureRecord(evidence, "windowsSmoke");
  const multiplayerFairness = ensureRecord(evidence, "multiplayerFairness");
  const macCodexCopilot = ensureRecord(evidence, "macCodexCopilot");
  const playerA = ensureRecord(multiplayerFairness, "playerA");
  const playerB = ensureRecord(multiplayerFairness, "playerB");

  evidence.evidenceKind = "real-manual-test";
  evidence.recordedAt = options.generatedAt;
  if (options.modVersion) {
    evidence.modVersion = options.modVersion;
  }
  evidence.notes =
    options.notes ??
    "Structured real manual test conclusions for release gates.";

  windowsSmoke.status = "pass";
  if (options.civ6Build) {
    windowsSmoke.civ6Build = options.civ6Build;
  }
  if (options.ruleset) {
    windowsSmoke.ruleset = options.ruleset;
  }
  for (const flag of windowsManualFlags) {
    windowsSmoke[flag] = true;
  }

  multiplayerFairness.status = "pass";
  if (options.ruleset) {
    multiplayerFairness.ruleset = options.ruleset;
  }
  for (const flag of multiplayerManualFlags) {
    multiplayerFairness[flag] = true;
  }
  for (const flag of playerManualFlags) {
    playerA[flag] = true;
    playerB[flag] = true;
  }

  macCodexCopilot.status = "pass";
  for (const flag of macCodexManualFlags) {
    macCodexCopilot[flag] = true;
  }
}

function collectMissingConfirmations(options: ManualEvidenceFinalizeOptions): string[] {
  const missing: string[] = [];
  if (!options.confirmWindowsSmoke) {
    missing.push("--confirm-windows-smoke");
  }
  if (!options.confirmMultiplayerFairness) {
    missing.push("--confirm-multiplayer-fairness");
  }
  if (!options.confirmMacCodexCopilot) {
    missing.push("--confirm-mac-codex-copilot");
  }
  if (!options.confirmArtifactScope) {
    missing.push("--confirm-artifact-scope");
  }
  return missing;
}

function buildNextActions(
  missingConfirmations: string[],
  validation: ManualEvidenceValidationResult,
  outputPath: string | undefined
): string[] {
  const actions: string[] = [];
  if (missingConfirmations.length > 0) {
    actions.push("完成真实 Windows 冒烟、双人多人公平和 Mac Codex handoff 副官测试后，重新运行并传入全部 --confirm-* 参数。");
  }
  if (!validation.schemaOk) {
    actions.push("按 schemas/manual-evidence.schema.json 修正证据字段。");
  }
  if (!validation.artifactScopeOk) {
    actions.push("将本地采集材料留在测试环境，证据 JSON 只保留结构化结论、版本和必要测试 metadata。");
  }
  if (validation.realEvidence && !validation.gates.windowsCiv6Load) {
    actions.push("Windows 机器字段仍未全部通过；先重新运行 evidence:draft 并补齐真实 Lua.log/snapshot 机器证据。");
  }
  if (validation.realEvidence && !validation.gates.multiplayerFairness) {
    actions.push("多人公平字段仍未全部通过；按 tests/manual/multiplayer-fairness-test.md 补齐 A/B 玩家检查。");
  }
  if (validation.realEvidence && !validation.gates.macCodexCopilot) {
    actions.push("Mac Codex 副官字段仍未全部通过；安装/校验 skill，读取 handoff prompt，并确认缺同步时不会盲答。");
  }
  if (validation.ok && outputPath) {
    actions.push(`可运行 npm run rc:check -- --manual-evidence ${quoteForMessage(outputPath)} --format markdown。`);
  } else if (validation.ok) {
    actions.push("可把该 JSON 保存为 manual-evidence.json 后接入 rc:check。");
  }
  return actions;
}

function ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (isRecord(value)) {
    return value;
  }
  const record: Record<string, unknown> = {};
  parent[key] = record;
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendList(lines: string[], title: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }
  lines.push("", `## ${title}`, ...items.map((item) => `- ${item}`));
}

function quoteForMessage(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}
