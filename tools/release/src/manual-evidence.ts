import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

export interface ManualEvidenceGateResults {
  windowsCiv6Load: boolean;
  multiplayerFairness: boolean;
  macCodexCopilot: boolean;
}

export interface ManualEvidenceValidationResult {
  ok: boolean;
  evidenceFileOk: boolean;
  schemaOk: boolean;
  artifactScopeOk: boolean;
  realEvidence: boolean;
  schemaErrors: string[];
  artifactScopeIssues: string[];
  policyIssues: string[];
  warnings: string[];
  gates: ManualEvidenceGateResults;
}

export interface ManualEvidenceCheckOptions {
  evidencePath: string;
}

export interface ManualEvidenceCheckReport {
  ok: boolean;
  evidencePath: string;
  generatedAt: string;
  validation: ManualEvidenceValidationResult;
}

const schemaUrl = new URL("../../../schemas/manual-evidence.schema.json", import.meta.url);
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;

let cachedValidator: ValidateFunction | undefined;

const windowsRequiredTrueFlags = [
  "modEnabledInAdditionalContent",
  "releaseManifestValidated",
  "copilotButtonVisible",
  "localizedTextOk",
  "syncCurrentTurnExported",
  "selectiveSyncExported",
  "luaLogLoaded",
  "controlsAvailable",
  "gameApiAvailable",
  "playersApiAvailable",
  "mapApiAvailable",
  "base64SelfTest",
  "sha256SelfTest",
  "bridgeLatestJson",
  "preflightPassed",
  "validatePassed",
  "summarizePassed",
  "renderMapPassed",
  "doctorPassed",
  "visibleDataBoundaryOk",
  "noGameplayMutationObserved"
];

const multiplayerRequiredTrueFlags = [
  "bothEnabledMod",
  "separateSnapshotDirs",
  "noDesyncObserved",
  "copilotUsesLocalVisibilityNotice"
];

const playerFairnessRequiredTrueFlags = [
  "localPlayerVerified",
  "ownCitiesOnly",
  "ownUnitsOnlyExceptVisibleForeign",
  "visibleForeignUnitsAreVisibleNow",
  "noHiddenMap",
  "noInvisibleForeignUnits",
  "noUnmetPlayers",
  "noOtherPlayerTechCivicsPolicies",
  "preflightPassed",
  "validatePassed",
  "summarizePassed",
  "renderMapVisibleOnly"
];

const macCodexRequiredTrueFlags = [
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

const scopedEvidenceBlockers = [
  {
    pattern: /[A-Za-z]:\\Users\\/,
    message: "contains a Windows home path"
  },
  {
    pattern: /\/Users\/[^/\s"]+/,
    message: "contains a macOS home path"
  },
  {
    pattern: /\.Civ6Save(?:\.bak)?\b/i,
    message: "mentions a Civ6 save file"
  },
  {
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
    message: "contains a likely API key"
  },
  {
    pattern: /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY|SECRET|TOKEN)\s*[:=]/i,
    message: "contains a likely secret assignment"
  }
];

export async function validateManualEvidenceFile(evidencePath: string): Promise<ManualEvidenceValidationResult> {
  let content: string;
  try {
    content = await readFile(evidencePath, "utf8");
  } catch (error) {
    return invalidManualEvidence([`$ could not be read: ${(error as Error).message}`]);
  }

  try {
    return await validateManualEvidenceObject(JSON.parse(content));
  } catch (error) {
    return invalidManualEvidence([`$ invalid JSON: ${(error as Error).message}`]);
  }
}

export async function runManualEvidenceCheck(options: ManualEvidenceCheckOptions): Promise<ManualEvidenceCheckReport> {
  const evidencePath = path.resolve(options.evidencePath);
  const validation = await validateManualEvidenceFile(evidencePath);
  return {
    ok: validation.ok,
    evidencePath,
    generatedAt: new Date().toISOString(),
    validation
  };
}

export function formatManualEvidenceMarkdown(report: ManualEvidenceCheckReport): string {
  const { validation } = report;
  const lines = [
    "# civ6-ai-copilot Manual Evidence Check",
    "",
    `- 总状态：${passFail(report.ok)}`,
    `- 证据文件：${report.evidencePath}`,
    `- 结构校验：${passFail(validation.schemaOk)}`,
    `- 发布材料边界：${passFail(validation.artifactScopeOk)}`,
    `- 真实测试标记：${passFail(validation.realEvidence)}`,
    `- Windows 加载 gate：${passFail(validation.gates.windowsCiv6Load)}`,
    `- 多人公平 gate：${passFail(validation.gates.multiplayerFairness)}`,
    `- Mac Codex 副官 gate：${passFail(validation.gates.macCodexCopilot)}`,
    `- 生成时间：${report.generatedAt}`
  ];

  appendIssues(lines, "Schema 问题", validation.schemaErrors);
  appendIssues(lines, "发布材料问题", validation.artifactScopeIssues);
  appendIssues(lines, "策略问题", validation.policyIssues);
  appendIssues(lines, "警告", validation.warnings);

  const nextActions = collectManualEvidenceNextActions(validation);
  if (nextActions.length > 0) {
    appendIssues(lines, "下一步", nextActions);
  }

  return `${lines.join("\n")}\n`;
}

export async function validateManualEvidenceObject(evidence: unknown): Promise<ManualEvidenceValidationResult> {
  const validate = await getValidator();
  const schemaOk = validate(evidence);
  const schemaErrors = schemaOk
    ? []
    : (validate.errors ?? []).map((error: ErrorObject) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`);
  const artifactScopeIssues = collectArtifactScopeIssues(evidence);
  const artifactScopeOk = artifactScopeIssues.length === 0;
  const evidenceRecord = isRecord(evidence) ? evidence : {};
  const realEvidence = evidenceRecord.evidenceKind === "real-manual-test";
  const policyIssues: string[] = [];
  const warnings: string[] = [];

  if (!realEvidence) {
    policyIssues.push("evidenceKind must be real-manual-test for RC gate evidence.");
  }

  const windowsIssues = evaluateWindowsSmoke(evidenceRecord);
  const multiplayerIssues = evaluateMultiplayerFairness(evidenceRecord);
  const macCodexIssues = evaluateMacCodexCopilot(evidenceRecord);
  if (realEvidence) {
    policyIssues.push(...windowsIssues, ...multiplayerIssues, ...macCodexIssues);
    policyIssues.push(...evaluateRealEvidencePlaceholders(evidenceRecord));
  }

  const evidenceFileOk = schemaOk && artifactScopeOk && realEvidence && policyIssues.length === 0;
  const windowsCiv6Load = evidenceFileOk && windowsIssues.length === 0;
  const multiplayerFairness = evidenceFileOk && multiplayerIssues.length === 0;
  const macCodexCopilot = evidenceFileOk && macCodexIssues.length === 0;

  const windowsSmoke = asRecord(evidenceRecord.windowsSmoke);
  if (evidenceFileOk && windowsSmoke.hasUnitsInPlot === false) {
    warnings.push(
      "windowsSmoke.hasUnitsInPlot is false; core export can still pass, but visible foreign unit capture may be limited."
    );
  }
  if (evidenceFileOk && windowsSmoke.hasPlayerResources === false) {
    warnings.push(
      "windowsSmoke.hasPlayerResources is false; core export can still pass, but resource-aware production, tech, and policy advice may be limited."
    );
  }
  if (evidenceFileOk && windowsSmoke.hasPlayerProgression === false) {
    warnings.push(
      "windowsSmoke.hasPlayerProgression is false; core export can still pass, but eureka, inspiration, and route advice may be limited."
    );
  }
  if (evidenceFileOk && windowsSmoke.hasGovernmentPolicies === false) {
    warnings.push(
      "windowsSmoke.hasGovernmentPolicies is false; core export can still pass, but government and policy-card advice may be limited."
    );
  }

  return {
    ok: evidenceFileOk && windowsCiv6Load && multiplayerFairness && macCodexCopilot,
    evidenceFileOk,
    schemaOk,
    artifactScopeOk,
    realEvidence,
    schemaErrors,
    artifactScopeIssues,
    policyIssues,
    warnings,
    gates: {
      windowsCiv6Load,
      multiplayerFairness,
      macCodexCopilot
    }
  };
}

async function getValidator(): Promise<ValidateFunction> {
  if (cachedValidator) {
    return cachedValidator;
  }

  const schema = JSON.parse(await readFile(fileURLToPath(schemaUrl), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const compiled = ajv.compile(schema);
  cachedValidator = compiled;
  return compiled;
}

function evaluateWindowsSmoke(evidence: Record<string, unknown>): string[] {
  const section = asRecord(evidence.windowsSmoke);
  const issues: string[] = [];
  if (section.status !== "pass") {
    issues.push("windowsSmoke.status must be pass.");
  }
  issues.push(...requiredTrueIssues(section, "windowsSmoke", windowsRequiredTrueFlags));
  return issues;
}

function evaluateMultiplayerFairness(evidence: Record<string, unknown>): string[] {
  const section = asRecord(evidence.multiplayerFairness);
  const issues: string[] = [];
  if (section.status !== "pass") {
    issues.push("multiplayerFairness.status must be pass.");
  }
  if (section.humanPlayers !== 2 && !(typeof section.humanPlayers === "number" && section.humanPlayers > 2)) {
    issues.push("multiplayerFairness.humanPlayers must be at least 2.");
  }
  issues.push(...requiredTrueIssues(section, "multiplayerFairness", multiplayerRequiredTrueFlags));
  issues.push(...requiredTrueIssues(asRecord(section.playerA), "multiplayerFairness.playerA", playerFairnessRequiredTrueFlags));
  issues.push(...requiredTrueIssues(asRecord(section.playerB), "multiplayerFairness.playerB", playerFairnessRequiredTrueFlags));
  return issues;
}

function evaluateMacCodexCopilot(evidence: Record<string, unknown>): string[] {
  const section = asRecord(evidence.macCodexCopilot);
  const issues: string[] = [];
  if (section.status !== "pass") {
    issues.push("macCodexCopilot.status must be pass.");
  }
  issues.push(...requiredTrueIssues(section, "macCodexCopilot", macCodexRequiredTrueFlags));
  return issues;
}

function evaluateRealEvidencePlaceholders(evidence: Record<string, unknown>): string[] {
  const windowsSmoke = asRecord(evidence.windowsSmoke);
  const multiplayerFairness = asRecord(evidence.multiplayerFairness);
  const checks = [
    ["modVersion", evidence.modVersion],
    ["windowsSmoke.civ6Build", windowsSmoke.civ6Build],
    ["windowsSmoke.ruleset", windowsSmoke.ruleset],
    ["multiplayerFairness.ruleset", multiplayerFairness.ruleset]
  ];

  return checks
    .filter(([, value]) => typeof value === "string" && value.includes("fill-after-real-test"))
    .map(([field]) => `${field} must be replaced with real-test metadata.`);
}

function requiredTrueIssues(section: Record<string, unknown>, prefix: string, flags: string[]): string[] {
  return flags
    .filter((flag) => section[flag] !== true)
    .map((flag) => `${prefix}.${flag} must be true.`);
}

function collectArtifactScopeIssues(value: unknown, path = "$"): string[] {
  if (typeof value === "string") {
    return scopedEvidenceBlockers
      .filter(({ pattern }) => pattern.test(value))
      .map(({ message }) => `${path} ${message}`);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectArtifactScopeIssues(item, `${path}[${index}]`));
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) => collectArtifactScopeIssues(item, `${path}.${key}`));
  }

  return [];
}

function invalidManualEvidence(schemaErrors: string[]): ManualEvidenceValidationResult {
  return {
    ok: false,
    evidenceFileOk: false,
    schemaOk: false,
    artifactScopeOk: true,
    realEvidence: false,
    schemaErrors,
    artifactScopeIssues: [],
    policyIssues: [],
    warnings: [],
    gates: {
      windowsCiv6Load: false,
      multiplayerFairness: false,
      macCodexCopilot: false
    }
  };
}

function appendIssues(lines: string[], title: string, issues: string[]): void {
  if (issues.length === 0) {
    return;
  }

  lines.push("", `## ${title}`, ...issues.map((issue) => `- ${issue}`));
}

function collectManualEvidenceNextActions(validation: ManualEvidenceValidationResult): string[] {
  const actions: string[] = [];
  if (!validation.schemaOk) {
    actions.push("按 schemas/manual-evidence.schema.json 修正 JSON 字段、类型和必填项。");
  }
  if (!validation.artifactScopeOk) {
    actions.push("将本地采集材料留在测试环境，证据 JSON 只保留结构化结论、版本和必要测试 metadata。");
  }
  if (!validation.realEvidence) {
    actions.push("真实 Windows 冒烟测试、双人多人公平测试和 Mac Codex handoff 副官测试完成后，运行 npm run evidence:finalize；模板证据不能过 gate。");
  }
  if (validation.evidenceFileOk && !validation.gates.windowsCiv6Load) {
    actions.push("按 tests/manual/windows-civ6-smoke-test.md 补齐 Windows Civ6 加载、Copilot 面板、Lua.log、bridge、doctor、preflight、validate、summarize 和 render-map 证据。");
  }
  if (validation.evidenceFileOk && !validation.gates.multiplayerFairness) {
    actions.push("按 tests/manual/multiplayer-fairness-test.md 补齐两名人类玩家的本地可见性和无 desync 证据。");
  }
  if (validation.evidenceFileOk && !validation.gates.macCodexCopilot) {
    actions.push("在 Mac Codex 副官机运行 skill:install / skill:validate-installed，读取 handoff/codex-prompt.md 和 copilot-handoff.md，并确认缺同步时不盲答。");
  }
  if (validation.ok) {
    actions.push("手工证据可接入 npm run rc:check -- --manual-evidence \"<manual-evidence.json>\" --format markdown。");
  }
  return actions;
}

function passFail(ok: boolean): string {
  return ok ? "通过" : "失败";
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
