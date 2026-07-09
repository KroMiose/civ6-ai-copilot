import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assembleExport, diagnoseLogContent, parseLogContent } from "../../bridge/src/parser.js";
import type { LogDiagnosticReport } from "../../bridge/src/protocol.js";
import { runDoctor, type DoctorReport } from "../../doctor/src/doctor.js";
import { renderSnapshotMapFile } from "../../render-map/src/render-map.js";
import { validateSnapshotFile, type SnapshotValidationResult } from "../../snapshot/src/validate.js";
import { runCopilotPreflight, type CopilotPreflightReport } from "../../copilot/src/preflight.js";
import { summarizeSnapshotFile, type SnapshotSummary } from "../../copilot/src/summarize-snapshot.js";
import { validateManualEvidenceObject, type ManualEvidenceValidationResult } from "./manual-evidence.js";
import {
  defaultCodexSkillsDir,
  SKILL_FOLDER_NAME,
  validatePackagedSkill
} from "../../skill-package/src/skill-package.js";
import { SCHEMA_VERSION, VERSION } from "../../project/src/version.js";

export interface ManualEvidenceDraftOptions {
  rootDir: string;
  outputPath?: string;
  modSourceDir?: string;
  inputLog?: string;
  snapshotPath?: string;
  snapshotDir?: string;
  question?: string;
  civ6Build?: string;
  ruleset?: string;
  modVersion?: string;
  playerASnapshot?: string;
  playerBSnapshot?: string;
  handoffDir?: string;
}

export interface ManualEvidenceDraftReport {
  evidence: Record<string, unknown>;
  outputPath?: string;
  generatedAt: string;
  machineChecks: {
    windows: MachineWindowsChecks;
    playerA?: MachinePlayerChecks;
    playerB?: MachinePlayerChecks;
    macCodexCopilot?: MachineMacCodexChecks;
  };
  draftValidation: ManualEvidenceValidationResult;
  nextActions: string[];
}

interface MachineWindowsChecks {
  luaLogLoaded: boolean;
  controlsAvailable: boolean;
  gameApiAvailable: boolean;
  playersApiAvailable: boolean;
  mapApiAvailable: boolean;
  base64SelfTest: boolean;
  sha256SelfTest: boolean;
  hasUnitsInPlot: boolean;
  hasPlayerResources: boolean;
  hasPlayerProgression: boolean;
  hasGovernmentPolicies: boolean;
  bridgeLatestJson: boolean;
  preflightPassed: boolean;
  validatePassed: boolean;
  summarizePassed: boolean;
  renderMapPassed: boolean;
  doctorPassed: boolean;
  visibleDataBoundaryOk: boolean;
  completeExportFound: boolean;
  exportTypes: string[];
  issues: string[];
}

interface MachinePlayerChecks {
  preflightPassed: boolean;
  validatePassed: boolean;
  summarizePassed: boolean;
  renderMapVisibleOnly: boolean;
  noHiddenMap: boolean;
  noInvisibleForeignUnits: boolean;
  noUnmetPlayers: boolean;
  noOtherPlayerTechCivicsPolicies: boolean;
  ownUnitsOnlyExceptVisibleForeign: boolean;
  visibleForeignUnitsAreVisibleNow: boolean;
  issues: string[];
}

interface MachineMacCodexChecks {
  skillInstalledValidated: boolean;
  handoffGenerated: boolean;
  codexPromptAvailable: boolean;
  copilotHandoffAvailable: boolean;
  copilotSummaryAvailable: boolean;
  latestSnapshotAvailable: boolean;
  snapshotValidatedOnCopilotMachine: boolean;
  preflightPassed: boolean;
  summarizePassed: boolean;
  localVisibilityNoticeShown: boolean;
  issues: string[];
}

const defaultQuestion = "我现在该不该开战？";

export async function createManualEvidenceDraft(options: ManualEvidenceDraftOptions): Promise<ManualEvidenceDraftReport> {
  const rootDir = path.resolve(options.rootDir);
  const snapshotPath = resolveSnapshotPath(options);
  const modSourceDir = path.resolve(options.modSourceDir ?? path.join(rootDir, "mod"));
  const question = options.question ?? defaultQuestion;
  const generatedAt = new Date().toISOString();
  const windows = await collectWindowsMachineChecks({
    modSourceDir,
    inputLog: options.inputLog,
    snapshotPath,
    snapshotDir: options.snapshotDir,
    question
  });
  const playerA = options.playerASnapshot
    ? await collectPlayerMachineChecks(path.resolve(options.playerASnapshot), question)
    : undefined;
  const playerB = options.playerBSnapshot
    ? await collectPlayerMachineChecks(path.resolve(options.playerBSnapshot), question)
    : undefined;
  const macCodexCopilot = options.handoffDir
    ? await collectMacCodexMachineChecks(path.resolve(options.handoffDir), question)
    : undefined;
  const ruleset = options.ruleset ?? (snapshotPath ? await readSnapshotRuleset(snapshotPath) : undefined) ?? "fill-after-real-test";

  const evidence: Record<string, unknown> = {
    $schema: "../../schemas/manual-evidence.schema.json",
    schemaVersion: SCHEMA_VERSION,
    evidenceKind: "template",
    recordedAt: generatedAt,
    modVersion: options.modVersion ?? VERSION,
    notes:
      "Machine-assisted release gate draft. Keep evidenceKind=template until real Windows and two-human multiplayer checks are manually confirmed.",
    windowsSmoke: buildWindowsSmokeDraft({
      windows,
      civ6Build: options.civ6Build ?? "fill-after-real-test",
      ruleset
    }),
    multiplayerFairness: buildMultiplayerDraft({
      ruleset,
      playerA,
      playerB
    }),
    macCodexCopilot: buildMacCodexCopilotDraft(macCodexCopilot)
  };

  const draftValidation = await validateManualEvidenceObject(evidence);
  const report: ManualEvidenceDraftReport = {
    evidence,
    outputPath: options.outputPath ? path.resolve(options.outputPath) : undefined,
    generatedAt,
    machineChecks: {
      windows,
      playerA,
      playerB,
      macCodexCopilot
    },
    draftValidation,
    nextActions: buildNextActions({ windows, playerA, playerB, macCodexCopilot })
  };

  if (report.outputPath) {
    await mkdir(path.dirname(report.outputPath), { recursive: true });
    await writeFile(report.outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  return report;
}

export function formatManualEvidenceDraftMarkdown(report: ManualEvidenceDraftReport): string {
  const lines = [
    "# civ6-ai-copilot Manual Evidence Draft",
    "",
    `- 状态：已生成测试证据草稿，仍需人工确认`,
    `- 输出：${report.outputPath ?? "未写入文件"}`,
    `- schema：${report.draftValidation.schemaOk ? "通过" : "失败"}`,
    `- 发布材料边界：${report.draftValidation.artifactScopeOk ? "通过" : "失败"}`,
    `- evidenceKind：template`,
    "",
    "## Windows 机器检查",
    ...machineRows(report.machineChecks.windows),
    ""
  ];

  if (report.machineChecks.playerA || report.machineChecks.playerB) {
    lines.push("## 多人 snapshot 机器检查");
    if (report.machineChecks.playerA) {
      lines.push("- playerA:", ...machineRows(report.machineChecks.playerA).map((line) => `  ${line}`));
    }
    if (report.machineChecks.playerB) {
      lines.push("- playerB:", ...machineRows(report.machineChecks.playerB).map((line) => `  ${line}`));
    }
    lines.push("");
  }

  if (report.machineChecks.macCodexCopilot) {
    lines.push(
      "## Mac Codex 机器检查",
      ...machineRows(report.machineChecks.macCodexCopilot),
      ""
    );
  }

  lines.push(
    "## 仍需人工确认",
    "- Windows Additional Content 中 Mod 可见且已启用。",
    "- 游戏内 Copilot 按钮可见，本地化文本正常。",
    "- 整理本回合和选择性整理按钮都实际点击过。",
    "- 测试过程中没有改变规则、单位、地图、生产、科技或网络同步状态。",
    "- 双人多人局中双方都启用 Mod、目录隔离、没有 desync，并各自检查只包含本地玩家理论可见信息。",
    "- Mac Codex 副官机已安装并验证 Mod-first skill，先读取 codex-prompt.md，再读取 copilot-handoff.md。",
    "- 当 handoff/preflight 显示需要同步时，Mac Codex 只要求回 Copilot 面板补同步，不输出最终局势结论。",
    "",
    "## 下一步",
    ...report.nextActions.map((action) => `- ${action}`)
  );

  return `${lines.join("\n")}\n`;
}

async function collectWindowsMachineChecks(options: {
  modSourceDir: string;
  inputLog?: string;
  snapshotPath?: string;
  snapshotDir?: string;
  question: string;
}): Promise<MachineWindowsChecks> {
  const issues: string[] = [];
  const diagnostic = await readLatestLuaDiagnostic(options.inputLog, issues);
  const snapshotChecks = options.snapshotPath
    ? await collectSnapshotChecks(options.snapshotPath, options.question)
    : emptySnapshotChecks("没有提供 latest.json。");
  const doctor = await runDoctor({
    modSourceDir: options.modSourceDir,
    inputLog: options.inputLog ? path.resolve(options.inputLog) : undefined,
    snapshot: options.snapshotPath,
    snapshotDir: options.snapshotDir
  });
  issues.push(...doctorIssues(doctor));

  return {
    luaLogLoaded: diagnostic.loaded,
    controlsAvailable: diagnostic.payload?.hasControls === true,
    gameApiAvailable: diagnostic.payload?.hasGame === true,
    playersApiAvailable: diagnostic.payload?.hasPlayers === true,
    mapApiAvailable: diagnostic.payload?.hasMap === true,
    base64SelfTest: diagnostic.payload?.base64SelfTest === true,
    sha256SelfTest: diagnostic.payload?.sha256SelfTest === true,
    hasUnitsInPlot: diagnostic.payload?.hasUnitsInPlot === true,
    hasPlayerResources: diagnostic.payload?.hasPlayerResources === true && diagnostic.payload?.hasGameInfoResources !== false,
    hasPlayerProgression:
      diagnostic.payload?.hasPlayerTechs === true &&
      diagnostic.payload?.hasGameInfoTechnologies === true &&
      diagnostic.payload?.hasPlayerCulture === true &&
      diagnostic.payload?.hasGameInfoCivics === true,
    hasGovernmentPolicies:
      diagnostic.payload?.hasGameInfoGovernments === true &&
      diagnostic.payload?.hasGameInfoPolicies === true &&
      diagnostic.payload?.hasGameInfoGovernmentSlots === true,
    completeExportFound: diagnostic.completeExportFound,
    exportTypes: diagnostic.exportTypes,
    bridgeLatestJson: snapshotChecks.validatePassed,
    preflightPassed: snapshotChecks.preflightPassed,
    validatePassed: snapshotChecks.validatePassed,
    summarizePassed: snapshotChecks.summarizePassed,
    renderMapPassed: snapshotChecks.renderMapPassed,
    doctorPassed: doctor.ok && requiredDoctorCheckPassed(doctor, "lua-log") && requiredDoctorCheckPassed(doctor, "snapshot"),
    visibleDataBoundaryOk: snapshotChecks.visibleDataBoundaryOk,
    issues: [...issues, ...snapshotChecks.issues]
  };
}

async function collectPlayerMachineChecks(snapshotPath: string, question: string): Promise<MachinePlayerChecks> {
  const checks = await collectSnapshotChecks(snapshotPath, question);
  return {
    preflightPassed: checks.preflightPassed,
    validatePassed: checks.validatePassed,
    summarizePassed: checks.summarizePassed,
    renderMapVisibleOnly: checks.renderMapPassed,
    noHiddenMap: checks.visibleDataBoundaryOk,
    noInvisibleForeignUnits: checks.visibleDataBoundaryOk,
    noUnmetPlayers: checks.visibleDataBoundaryOk,
    noOtherPlayerTechCivicsPolicies: checks.visibleDataBoundaryOk,
    ownUnitsOnlyExceptVisibleForeign: checks.visibleDataBoundaryOk,
    visibleForeignUnitsAreVisibleNow: checks.visibleDataBoundaryOk,
    issues: checks.issues
  };
}

async function collectMacCodexMachineChecks(handoffDir: string, question: string): Promise<MachineMacCodexChecks> {
  const issues: string[] = [];
  const codexPromptPath = path.join(handoffDir, "codex-prompt.md");
  const copilotHandoffPath = path.join(handoffDir, "copilot-handoff.md");
  const copilotSummaryPath = path.join(handoffDir, "copilot-summary.md");
  const latestPath = path.join(handoffDir, "latest.json");

  const [codexPrompt, copilotHandoff, copilotSummary, latestSnapshotAvailable] = await Promise.all([
    readOptionalText(codexPromptPath),
    readOptionalText(copilotHandoffPath),
    readOptionalText(copilotSummaryPath),
    fileExists(latestPath)
  ]);

  const codexPromptAvailable = codexPrompt !== undefined;
  const copilotHandoffAvailable = copilotHandoff !== undefined;
  const copilotSummaryAvailable = copilotSummary !== undefined;
  if (!codexPromptAvailable) {
    issues.push("handoff 缺少 codex-prompt.md。");
  }
  if (!copilotHandoffAvailable) {
    issues.push("handoff 缺少 copilot-handoff.md。");
  }
  if (!copilotSummaryAvailable) {
    issues.push("handoff 缺少 copilot-summary.md。");
  }
  if (!latestSnapshotAvailable) {
    issues.push("handoff 缺少 latest.json。");
  }

  const skillInstalledValidated = await validateInstalledSkillForDraft(issues);
  const localVisibilityNoticeShown = [codexPrompt, copilotHandoff, copilotSummary]
    .filter((value): value is string => typeof value === "string")
    .some((text) => /本地玩家理论可见信息|player-visible/.test(text));
  if (!localVisibilityNoticeShown) {
    issues.push("handoff 文档缺少本地玩家理论可见信息提醒。");
  }

  let snapshotValidatedOnCopilotMachine = false;
  let preflightPassed = false;
  let summarizePassed = false;
  if (latestSnapshotAvailable) {
    try {
      const validation = await validateSnapshotFile(latestPath);
      snapshotValidatedOnCopilotMachine = validation.ok;
      if (!validation.ok) {
        issues.push("handoff latest.json 未通过 schema/fairness 校验。");
      }
    } catch (error) {
      issues.push(`handoff latest.json 校验无法运行：${(error as Error).message}`);
    }

    try {
      const preflight = await runCopilotPreflight({ snapshotPath: latestPath, question });
      preflightPassed = preflight.canAnalyze;
      if (!preflight.canAnalyze) {
        issues.push(...preflight.issues, ...preflight.nextActions);
      }
    } catch (error) {
      issues.push(`handoff preflight 无法运行：${(error as Error).message}`);
    }

    try {
      const summary = await summarizeSnapshotFile(latestPath, { question, allowInvalid: true });
      summarizePassed = summary.validation.ok && summary.syncAdvice.ok;
      if (!summarizePassed) {
        issues.push("handoff summary 显示 snapshot 不可分析或缺少当前问题所需模块。");
      }
    } catch (error) {
      issues.push(`handoff summarize 无法运行：${(error as Error).message}`);
    }
  }

  return {
    skillInstalledValidated,
    handoffGenerated: codexPromptAvailable && copilotHandoffAvailable,
    codexPromptAvailable,
    copilotHandoffAvailable,
    copilotSummaryAvailable,
    latestSnapshotAvailable,
    snapshotValidatedOnCopilotMachine,
    preflightPassed,
    summarizePassed,
    localVisibilityNoticeShown,
    issues
  };
}

async function validateInstalledSkillForDraft(issues: string[]): Promise<boolean> {
  const validation = await validatePackagedSkill(path.join(defaultCodexSkillsDir(), SKILL_FOLDER_NAME));
  if (!validation.ok) {
    issues.push("Mac Codex 副官机当前安装的 civ6-ai-copilot skill 未通过校验。");
  }
  return validation.ok;
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  return (await readOptionalText(filePath)) !== undefined;
}

async function collectSnapshotChecks(snapshotPath: string, question: string): Promise<{
  preflightPassed: boolean;
  validatePassed: boolean;
  summarizePassed: boolean;
  renderMapPassed: boolean;
  visibleDataBoundaryOk: boolean;
  issues: string[];
}> {
  const issues: string[] = [];
  let validation: SnapshotValidationResult | undefined;
  let preflight: CopilotPreflightReport | undefined;
  let summary: SnapshotSummary | undefined;
  let renderMapPassed = false;

  try {
    validation = await validateSnapshotFile(snapshotPath);
    if (!validation.ok) {
      issues.push("snapshot schema/fairness validation failed.");
    }
  } catch (error) {
    issues.push(`snapshot validation could not run: ${(error as Error).message}`);
  }

  try {
    preflight = await runCopilotPreflight({ snapshotPath, question });
    if (!preflight.canAnalyze) {
      issues.push(...preflight.issues, ...preflight.nextActions);
    }
  } catch (error) {
    issues.push(`preflight could not run: ${(error as Error).message}`);
  }

  try {
    summary = await summarizeSnapshotFile(snapshotPath, { question, allowInvalid: true });
    if (!summary.validation.ok || !summary.syncAdvice.ok) {
      issues.push("summary reports invalid snapshot or missing question-critical modules.");
    }
  } catch (error) {
    issues.push(`summary could not run: ${(error as Error).message}`);
  }

  try {
    const rendered = await renderSnapshotMapFile(snapshotPath);
    renderMapPassed = rendered.validation.ok && rendered.counts.tiles > 0;
    if (!renderMapPassed) {
      issues.push("render-map produced no visible tiles.");
    }
  } catch (error) {
    issues.push(`render-map could not run: ${(error as Error).message}`);
  }

  return {
    preflightPassed: preflight?.canAnalyze === true,
    validatePassed: validation?.ok === true,
    summarizePassed: summary !== undefined && summary.validation.ok && summary.syncAdvice.ok,
    renderMapPassed,
    visibleDataBoundaryOk: validation?.fairnessOk === true,
    issues
  };
}

async function readLatestLuaDiagnostic(inputLog: string | undefined, issues: string[]): Promise<{
  loaded: boolean;
  completeExportFound: boolean;
  exportTypes: string[];
  payload?: Record<string, unknown>;
}> {
  if (!inputLog) {
    issues.push("没有提供 Lua.log，无法自动确认 Mod 加载和 Lua runtime 自检。");
    return { loaded: false, completeExportFound: false, exportTypes: [] };
  }

  try {
    const content = await readFile(inputLog, "utf8");
    const diagnostics = diagnoseLogContent(content);
    issues.push(...diagnostics.issues);
    return {
      loaded: diagnostics.loadedLines.length > 0,
      completeExportFound: diagnostics.completeExportCount > 0,
      exportTypes: collectCompleteExportTypes(content, issues),
      payload: findLatestRuntimeDiagnostic(diagnostics)
    };
  } catch (error) {
    issues.push(`Lua.log could not be read: ${(error as Error).message}`);
    return { loaded: false, completeExportFound: false, exportTypes: [] };
  }
}

function collectCompleteExportTypes(content: string, issues: string[]): string[] {
  const exportTypes = new Set<string>();
  let parsedExports;
  try {
    parsedExports = parseLogContent(content);
  } catch (error) {
    issues.push(`Lua.log export types could not be parsed: ${(error as Error).message}`);
    return [];
  }

  for (const parsed of parsedExports) {
    if (!parsed.end || parsed.issues.length > 0) {
      continue;
    }
    try {
      const assembled = assembleExport(parsed);
      const snapshot = assembled.snapshot as { source?: { exportType?: unknown } };
      if (typeof snapshot.source?.exportType === "string" && snapshot.source.exportType.length > 0) {
        exportTypes.add(snapshot.source.exportType);
      }
    } catch (error) {
      issues.push(`Lua.log export ${parsed.begin.exportId} could not be decoded for exportType: ${(error as Error).message}`);
    }
  }

  return [...exportTypes].sort();
}

function findLatestRuntimeDiagnostic(diagnostics: LogDiagnosticReport): Record<string, unknown> | undefined {
  return [...diagnostics.diagnostics]
    .reverse()
    .find((diagnostic) =>
      [
        "hasControls",
        "hasGame",
        "hasPlayers",
        "hasMap",
        "hasUnitsInPlot",
        "hasPlayerResources",
        "hasGameInfoResources",
        "hasPlayerTechs",
        "hasGameInfoTechnologies",
        "hasPlayerCulture",
        "hasGameInfoCivics",
        "hasGameInfoGovernments",
        "hasGameInfoPolicies",
        "hasGameInfoGovernmentSlots"
      ].some((key) => key in diagnostic.payload)
    )?.payload;
}

function buildWindowsSmokeDraft(options: {
  windows: MachineWindowsChecks;
  civ6Build: string;
  ruleset: string;
}): Record<string, unknown> {
  const machineBlocked = options.windows.issues.length > 0 || !options.windows.doctorPassed;
  return {
    status: machineBlocked ? "fail" : "not-run",
    civ6Build: options.civ6Build,
    ruleset: options.ruleset,
    modEnabledInAdditionalContent: false,
    releaseManifestValidated: false,
    copilotButtonVisible: false,
    localizedTextOk: false,
    syncCurrentTurnExported: options.windows.exportTypes.includes("turn"),
    selectiveSyncExported: options.windows.exportTypes.some((exportType) => exportType === "modules" || exportType === "map-window" || exportType === "visible-map"),
    luaLogLoaded: options.windows.luaLogLoaded,
    controlsAvailable: options.windows.controlsAvailable,
    gameApiAvailable: options.windows.gameApiAvailable,
    playersApiAvailable: options.windows.playersApiAvailable,
    mapApiAvailable: options.windows.mapApiAvailable,
    base64SelfTest: options.windows.base64SelfTest,
    sha256SelfTest: options.windows.sha256SelfTest,
    hasUnitsInPlot: options.windows.hasUnitsInPlot,
    hasPlayerResources: options.windows.hasPlayerResources,
    hasPlayerProgression: options.windows.hasPlayerProgression,
    hasGovernmentPolicies: options.windows.hasGovernmentPolicies,
    bridgeLatestJson: options.windows.bridgeLatestJson,
    preflightPassed: options.windows.preflightPassed,
    validatePassed: options.windows.validatePassed,
    summarizePassed: options.windows.summarizePassed,
    renderMapPassed: options.windows.renderMapPassed,
    doctorPassed: options.windows.doctorPassed,
    visibleDataBoundaryOk: options.windows.visibleDataBoundaryOk,
    noGameplayMutationObserved: false,
    notes: "Machine fields were prefilled from tool results. Manually confirm UI visibility, localization, release manifest, selective sync, and no gameplay mutation before changing evidenceKind."
  };
}

function buildMultiplayerDraft(options: {
  ruleset: string;
  playerA?: MachinePlayerChecks;
  playerB?: MachinePlayerChecks;
}): Record<string, unknown> {
  const hasBoth = Boolean(options.playerA && options.playerB);
  const machineBlocked = [options.playerA, options.playerB].some((checks) => checks && checks.issues.length > 0);
  return {
    status: machineBlocked ? "fail" : "not-run",
    humanPlayers: 2,
    ruleset: options.ruleset,
    bothEnabledMod: false,
    separateSnapshotDirs: false,
    noDesyncObserved: false,
    copilotUsesLocalVisibilityNotice: false,
    playerA: buildPlayerDraft(options.playerA, hasBoth),
    playerB: buildPlayerDraft(options.playerB, hasBoth),
    notes: "Machine fields can only validate snapshot shape and visible-data boundaries. Two-human same-game setup, no desync, and cross-player visibility checks still require manual confirmation."
  };
}

function buildPlayerDraft(checks: MachinePlayerChecks | undefined, hasBoth: boolean): Record<string, unknown> {
  return {
    localPlayerVerified: false,
    ownCitiesOnly: false,
    ownUnitsOnlyExceptVisibleForeign: checks?.ownUnitsOnlyExceptVisibleForeign === true,
    visibleForeignUnitsAreVisibleNow: checks?.visibleForeignUnitsAreVisibleNow === true,
    noHiddenMap: checks?.noHiddenMap === true,
    noInvisibleForeignUnits: checks?.noInvisibleForeignUnits === true,
    noUnmetPlayers: checks?.noUnmetPlayers === true,
    noOtherPlayerTechCivicsPolicies: checks?.noOtherPlayerTechCivicsPolicies === true,
    preflightPassed: checks?.preflightPassed === true,
    validatePassed: checks?.validatePassed === true,
    summarizePassed: checks?.summarizePassed === true,
    renderMapVisibleOnly: checks?.renderMapVisibleOnly === true && hasBoth
  };
}

function buildMacCodexCopilotDraft(checks?: MachineMacCodexChecks): Record<string, unknown> {
  return {
    status: checks && checks.issues.length > 0 ? "fail" : "not-run",
    skillInstalledValidated: checks?.skillInstalledValidated === true,
    handoffGenerated: checks?.handoffGenerated === true,
    codexPromptReadFirst: false,
    copilotHandoffRead: false,
    snapshotValidatedOnCopilotMachine: checks?.snapshotValidatedOnCopilotMachine === true,
    localVisibilityNoticeShown: checks?.localVisibilityNoticeShown === true,
    syncBlockerHonored: false,
    noBlindAnalysisWhenSyncRequired: false,
    handoffScopeHonored: false,
    notes: checks
      ? "Machine fields were prefilled from installed skill validation and handoff directory checks. Manually confirm Codex read order, blocker behavior, and handoff scope before changing evidenceKind."
      : "Run skill:install / skill:validate-installed on the Mac Codex copilot machine, then use the handoff directory. Record only pass/fail conclusions here."
  };
}

function buildNextActions(options: {
  windows: MachineWindowsChecks;
  playerA?: MachinePlayerChecks;
  playerB?: MachinePlayerChecks;
  macCodexCopilot?: MachineMacCodexChecks;
}): string[] {
  const actions: string[] = [];
  if (options.windows.issues.length > 0 || !options.windows.doctorPassed) {
    actions.push("先修复 Windows 机器检查失败项，再把证据草稿改成 real-manual-test。");
  }
  actions.push("打开 tests/manual/windows-civ6-smoke-test.md，人工确认 Additional Content、原生 LaunchBar 中的 Copilot 按钮、本地化、选择性整理和无玩法修改。");
  if (!options.playerA || !options.playerB) {
    actions.push("完成 tests/manual/multiplayer-fairness-test.md 后，用 --player-a-snapshot 和 --player-b-snapshot 重新生成草稿。");
  } else {
    actions.push("人工交叉检查 A/B snapshot 是否分别只含各自理论可见信息，再确认 multiplayerFairness 的人工字段。");
  }
  if (!options.macCodexCopilot) {
    actions.push("在 Mac Codex 副官机运行 npm run skill:install -- --clean 和 npm run skill:validate-installed，并用 --handoff-dir 重新生成草稿以预检 handoff。");
  } else if (options.macCodexCopilot.issues.length > 0) {
    actions.push("修复 Mac Codex handoff 机器检查失败项，再确认 Codex 读取顺序和缺同步时不盲答。");
  } else {
    actions.push("Mac Codex handoff 文件和 snapshot 机器检查已通过；人工确认 Codex 读取顺序、缺同步阻断和 handoff 范围。");
  }
  actions.push("确认所有人工字段后，运行 npm run evidence:finalize 写出 real-manual-test 证据，再运行 npm run evidence:validate。");
  return actions;
}

function machineRows(checks: object & { issues: string[] }): string[] {
  return Object.entries(checks as { [key: string]: unknown })
    .filter(([key]) => key !== "issues")
    .map(([key, value]) => `- ${key}: ${value === true ? "通过" : value === false ? "未通过/待确认" : String(value)}`);
}

function doctorIssues(report: DoctorReport): string[] {
  return report.checks
    .filter((check) => check.status === "fail")
    .map((check) => `${check.id}: ${check.message}`);
}

function requiredDoctorCheckPassed(report: DoctorReport, id: string): boolean {
  const check = report.checks.find((candidate) => candidate.id === id);
  return check?.status === "pass" || check?.status === "warn";
}

function resolveSnapshotPath(options: ManualEvidenceDraftOptions): string | undefined {
  if (options.snapshotPath) {
    return path.resolve(options.snapshotPath);
  }
  if (options.snapshotDir) {
    return path.join(path.resolve(options.snapshotDir), "latest.json");
  }
  return undefined;
}

async function readSnapshotRuleset(snapshotPath: string): Promise<string | undefined> {
  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as { session?: { ruleset?: unknown } };
    return typeof snapshot.session?.ruleset === "string" && snapshot.session.ruleset.length > 0
      ? snapshot.session.ruleset
      : undefined;
  } catch {
    return undefined;
  }
}

function emptySnapshotChecks(message: string): {
  preflightPassed: boolean;
  validatePassed: boolean;
  summarizePassed: boolean;
  renderMapPassed: boolean;
  visibleDataBoundaryOk: boolean;
  issues: string[];
} {
  return {
    preflightPassed: false,
    validatePassed: false,
    summarizePassed: false,
    renderMapPassed: false,
    visibleDataBoundaryOk: false,
    issues: [message]
  };
}
