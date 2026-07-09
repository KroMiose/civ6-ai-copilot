import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { assembleLatestCompleteExport, diagnoseLogContent, parseLogContent } from "../../bridge/src/parser.js";
import type { AssembledSnapshot, LogDiagnosticReport, ParsedExport, SnapshotBegin } from "../../bridge/src/protocol.js";
import { validateModSource } from "../../package/src/mod-package.js";
import { validateSnapshotFile, validateSnapshotObject, type SnapshotValidationResult } from "../../snapshot/src/validate.js";

export type DoctorStatus = "pass" | "warn" | "fail" | "skip";

export interface DoctorCheck {
  id: string;
  title: string;
  status: DoctorStatus;
  message: string;
  nextAction?: string;
  details?: unknown;
}

export interface DoctorOptions {
  modSourceDir: string;
  inputLog?: string;
  userInterfaceLog?: string;
  moddingLog?: string;
  databaseLog?: string;
  snapshot?: string;
  snapshotDir?: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    skip: number;
  };
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  checks.push(checkNodeVersion());
  checks.push(await checkModSource(options.modSourceDir));
  checks.push(await checkLuaLog(options.inputLog));
  checks.push(await checkCiv6GameLogs(options));
  checks.push(await checkSnapshot(resolveSnapshotPath(options)));

  const summary = summarize(checks);
  return {
    ok: summary.fail === 0,
    checks,
    summary
  };
}

async function checkCiv6GameLogs(options: DoctorOptions): Promise<DoctorCheck> {
  if (!options.userInterfaceLog && !options.moddingLog && !options.databaseLog) {
    return {
      id: "civ6-game-logs",
      title: "Civ6 game logs",
      status: "skip",
      message: "No Modding.log, UserInterface.log, or Database.log path was provided.",
      nextAction:
        "For real Civ6 tests, rerun doctor with --modding-log <Modding.log> --user-interface-log <UserInterface.log> --database-log <Database.log>."
    };
  }

  const [luaLog, userInterfaceLog, moddingLog, databaseLog] = await Promise.all([
    readOptionalLog(options.inputLog, "Lua.log"),
    readOptionalLog(options.userInterfaceLog, "UserInterface.log"),
    readOptionalLog(options.moddingLog, "Modding.log"),
    readOptionalLog(options.databaseLog, "Database.log")
  ]);
  const readFailure = [userInterfaceLog, moddingLog, databaseLog].find((log) => log.status === "fail");
  if (readFailure?.status === "fail") {
    return {
      id: "civ6-game-logs",
      title: "Civ6 game logs",
      status: "fail",
      message: readFailure.message,
      nextAction: readFailure.nextAction
    };
  }

  const luaContent = luaLog.status === "pass" ? luaLog.content : "";
  const uiContent = userInterfaceLog.status === "pass" ? userInterfaceLog.content : "";
  const moddingContent = moddingLog.status === "pass" ? moddingLog.content : "";
  const databaseContent = databaseLog.status === "pass" ? databaseLog.content : "";

  const copilotScanned = isCopilotMentioned(moddingContent);
  const copilotUiContextLoaded = /civ6_ai_copilot(?:_loader)?|CIV6_AI_COPILOT|Civ6AICopilot/i.test(
    uiContent
  );
  const luaMarkerLoaded = luaContent.includes("CIV6_AI_COPILOT_LOADED");
  const databaseFailedValidation = /\[Gameplay\]: Failed Validation\.?/i.test(databaseContent);
  const copilotTextLoaded = /civ6-ai-copilot-text\.xml/i.test(moddingContent);

  if (moddingLog.status === "pass" && !copilotScanned) {
    return {
      id: "civ6-game-logs",
      title: "Civ6 game logs",
      status: "fail",
      message: "Modding.log does not show civ6-ai-copilot being scanned or loaded.",
      nextAction:
        "Open Additional Content > Mods, confirm civ6-ai-copilot is visible and enabled, then restart Civ6 and rerun doctor with the current Modding.log."
    };
  }

  if (databaseFailedValidation) {
    return {
      id: "civ6-game-logs",
      title: "Civ6 game logs",
      status: "fail",
      message:
        "Database.log reports Gameplay Failed Validation while starting the game, so InGame UI may never load.",
      nextAction:
        "Use a clean test profile or disable other Workshop/gameplay Mods, keep civ6-ai-copilot enabled, restart Civ6, and rerun doctor with Modding.log, Database.log, UserInterface.log, and Lua.log.",
      details: {
        copilotScanned,
        copilotTextLoaded,
        failedValidation: true
      }
    };
  }

  if (copilotUiContextLoaded && !luaMarkerLoaded) {
    return {
      id: "civ6-game-logs",
      title: "Civ6 game logs",
      status: "fail",
      message: "UserInterface.log shows the Copilot UI XML context, but Lua.log has no CIV6_AI_COPILOT_LOADED Lua marker.",
      nextAction:
        "Confirm AddUserInterfaces points directly at ui/civ6_ai_copilot.xml and ImportFiles imports ui/civ6_ai_copilot.lua, compare UserInterface.log and Lua.log from the same Civ6 run, then restart Civ6 and retest.",
      details: {
        copilotScanned,
        copilotUiContextLoaded,
        luaMarkerLoaded
      }
    };
  }

  if (copilotScanned && !luaMarkerLoaded) {
    return {
      id: "civ6-game-logs",
      title: "Civ6 game logs",
      status: "warn",
      message: "Modding.log shows civ6-ai-copilot was scanned, but no InGame Lua marker was found yet.",
      nextAction:
        "Start or load an actual game, open the briefing panel if visible, then rerun doctor with current UserInterface.log and Lua.log.",
      details: {
        copilotScanned,
        copilotTextLoaded,
        copilotUiContextLoaded,
        luaMarkerLoaded
      }
    };
  }

  return {
    id: "civ6-game-logs",
    title: "Civ6 game logs",
    status: "pass",
    message: "Civ6 game logs do not show a game-content blocker for civ6-ai-copilot.",
    details: {
      copilotScanned,
      copilotTextLoaded,
      copilotUiContextLoaded,
      luaMarkerLoaded
    }
  };
}

type OptionalLogRead =
  | { status: "skip"; label: string }
  | { status: "pass"; label: string; content: string }
  | { status: "fail"; label: string; message: string; nextAction: string };

async function readOptionalLog(filePath: string | undefined, label: string): Promise<OptionalLogRead> {
  if (!filePath) {
    return { status: "skip", label };
  }
  try {
    return { status: "pass", label, content: await readFile(filePath, "utf8") };
  } catch (error) {
    return {
      status: "fail",
      label,
      message: `Could not read ${label}: ${(error as Error).message}`,
      nextAction: `Check the path to Civilization VI Logs/${label}.`
    };
  }
}

function isCopilotMentioned(content: string): boolean {
  return /civ6-ai-copilot|8d2f71ce-6b34-4dbf-92da-cf7c2e21d2b7/i.test(content);
}

export function formatDoctorMarkdown(report: DoctorReport): string {
  const lines = [
    "# civ6-ai-copilot Doctor",
    "",
    `- 总状态：${report.ok ? "通过" : "失败"}`,
    `- pass：${report.summary.pass}`,
    `- warn：${report.summary.warn}`,
    `- fail：${report.summary.fail}`,
    `- skip：${report.summary.skip}`,
    "",
    "## Checks",
    ...report.checks.flatMap((check) => {
      const checkLines = [`- ${check.status}: ${check.id} - ${check.message}`];
      if (check.nextAction) {
        checkLines.push(`  下一步：${check.nextAction}`);
      }
      return checkLines;
    })
  ];

  const blockingActions = report.checks
    .filter((check) => check.status === "fail" && check.nextAction)
    .map((check) => check.nextAction as string);
  if (blockingActions.length > 0) {
    lines.push("", "## 阻断项下一步", ...blockingActions.map((action) => `- ${action}`));
  }

  const warningActions = report.checks
    .filter((check) => check.status === "warn" && check.nextAction)
    .map((check) => check.nextAction as string);
  if (warningActions.length > 0) {
    lines.push("", "## 警告项下一步", ...warningActions.map((action) => `- ${action}`));
  }

  return `${lines.join("\n")}\n`;
}

function checkNodeVersion(): DoctorCheck {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major >= 20) {
    return {
      id: "node-version",
      title: "Node.js version",
      status: "pass",
      message: `Node ${process.versions.node} is supported.`
    };
  }

  return {
    id: "node-version",
    title: "Node.js version",
    status: "fail",
    message: `Node ${process.versions.node} is too old.`,
    nextAction: "Install Node.js 20 or newer."
  };
}

async function checkModSource(modSourceDir: string): Promise<DoctorCheck> {
  const validation = await validateModSource(modSourceDir);
  if (validation.ok) {
    return {
      id: "mod-source",
      title: "Mod source package",
      status: "pass",
      message: "Mod source has the required .modinfo, UI XML, and Lua files.",
      details: validation
    };
  }

  return {
    id: "mod-source",
    title: "Mod source package",
    status: "fail",
    message: "Mod source is not installable in its current shape.",
    nextAction: "Run npm run mod:validate and fix the reported .modinfo/files issues.",
    details: validation
  };
}

async function checkLuaLog(inputLog?: string): Promise<DoctorCheck> {
  if (!inputLog) {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "skip",
      message: "No Lua.log path was provided.",
      nextAction: "After testing in Civ6, rerun doctor with --input-log <Lua.log>."
    };
  }

  let content: string;
  try {
    content = await readFile(inputLog, "utf8");
  } catch (error) {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "fail",
      message: `Could not read Lua.log: ${(error as Error).message}`,
      nextAction: "Check the path to Civilization VI Logs/Lua.log."
    };
  }

  const diagnostics = diagnoseLogContent(content);
  if (diagnostics.loadedLines.length === 0) {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "fail",
      message: "Lua.log does not contain CIV6_AI_COPILOT_LOADED.",
      nextAction: "Confirm the Mod is enabled in Additional Content and that this is the current Lua.log.",
      details: diagnostics
    };
  }

  const failedSelfTestDiagnostic = diagnostics.diagnostics.find(
    (diagnostic) => diagnostic.payload.base64SelfTest === false || diagnostic.payload.sha256SelfTest === false
  )?.payload;
  if (failedSelfTestDiagnostic) {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "fail",
      message: "The Mod loaded, but Lua export self-tests failed.",
      nextAction: "Do not analyze this snapshot. Share the diagnostic payload and fix Lua compatibility first.",
      details: diagnostics
    };
  }

  const latestLaunchBarDiagnostic = findLatestLaunchBarDiagnostic(diagnostics);
  if (latestLaunchBarDiagnostic?.reason === "launchbar-unavailable") {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "fail",
      message: "The Mod loaded, but the Copilot button could not attach to the native Civ6 LaunchBar.",
      nextAction:
        "Enter a real game and check the left-top LaunchBar for the Copilot icon button. If it is missing, rerun doctor with current Lua.log and UserInterface.log before analyzing gameplay.",
      details: diagnostics
    };
  }

  const latestRuntimeDiagnostic = findLatestRuntimeDiagnostic(diagnostics);
  const runtimeIssue = diagnoseLuaRuntimePayload(latestRuntimeDiagnostic);
  if (runtimeIssue.status === "fail") {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "fail",
      message: runtimeIssue.message,
      nextAction: runtimeIssue.nextAction,
      details: diagnostics
    };
  }

  if (diagnostics.exportCount === 0) {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "warn",
      message: "The Mod loaded, but no snapshot export was found.",
      nextAction: "Open the briefing panel in Civ6 and click 汇总本回合.",
      details: diagnostics
    };
  }

  if (diagnostics.completeExportCount === 0 || diagnostics.issues.length > 0) {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "fail",
      message: "Snapshot export markers are present but incomplete or malformed.",
      nextAction: "Click 汇总本回合 again, then rerun bridge/doctor against the updated Lua.log.",
      details: diagnostics
    };
  }

  const unitPlotWarning = latestRuntimeDiagnostic?.hasUnitsInPlot === false;
  const playerResourcesWarning =
    latestRuntimeDiagnostic?.hasPlayerResources === false || latestRuntimeDiagnostic?.hasGameInfoResources === false;
  const playerProgressionWarning =
    latestRuntimeDiagnostic?.hasPlayerTechs === false ||
    latestRuntimeDiagnostic?.hasGameInfoTechnologies === false ||
    latestRuntimeDiagnostic?.hasPlayerCulture === false ||
    latestRuntimeDiagnostic?.hasGameInfoCivics === false;
  const governmentPolicyWarning =
    latestRuntimeDiagnostic?.hasGameInfoGovernments === false ||
    latestRuntimeDiagnostic?.hasGameInfoPolicies === false ||
    latestRuntimeDiagnostic?.hasGameInfoGovernmentSlots === false;
  let assembled: AssembledSnapshot;
  let latestCompleteExport: ParsedExport | undefined;

  try {
    const parsedExports = parseLogContent(content);
    latestCompleteExport = findLatestCompleteExport(parsedExports);
    assembled = assembleLatestCompleteExport(parsedExports);
    const validation = await validateSnapshotObject(assembled.snapshot);
    if (!validation.ok) {
      return {
        id: "lua-log",
        title: "Lua.log diagnostics",
        status: "fail",
        message: "Latest Lua.log export was complete, but schema/fairness validation failed.",
        nextAction: "Inspect validation errors before using this snapshot for advice.",
        details: { diagnostics, validation }
      };
    }
  } catch (error) {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "fail",
      message: `Bridge could not assemble the latest export: ${(error as Error).message}`,
      nextAction: "Rerun 汇总本回合 and check for missing chunks or checksum mismatch.",
      details: diagnostics
    };
  }

  const completionDiagnostic = diagnoseExportCompletionDiagnostic(diagnostics, latestCompleteExport?.begin);
  if (completionDiagnostic.status === "fail") {
    return {
      id: "lua-log",
      title: "Lua.log diagnostics",
      status: "fail",
      message: completionDiagnostic.message,
      nextAction: completionDiagnostic.nextAction,
      details: { diagnostics, latestCompleteExport: latestCompleteExport?.begin }
    };
  }

  const warningMessages: string[] = [];
  const nextActions: string[] = [];
  if (completionDiagnostic.status === "warn") {
    warningMessages.push(completionDiagnostic.message);
    nextActions.push(completionDiagnostic.nextAction);
  }
  if (unitPlotWarning) {
    warningMessages.push("Units.GetUnitsInPlot is unavailable.");
    nextActions.push(
      "Core advice can continue; for war/frontline questions, provide screenshots or manually confirm visible foreign units until this Civ6 Lua API is available."
    );
  }
  if (playerResourcesWarning) {
    warningMessages.push("Player resource stockpile API is unavailable.");
    nextActions.push(
      "Core advice can continue, but production/tech/policy advice may miss strategic and luxury resource constraints; manually confirm resources or retest after entering a real in-game turn."
    );
  }
  if (playerProgressionWarning) {
    warningMessages.push("Player tech/civic progression API is unavailable.");
    nextActions.push(
      "Core advice can continue, but eureka/inspiration, policy, and route advice may be limited; manually confirm the tech/civic/government screens if this warning persists after Sync Tech/Civics."
    );
  }
  if (governmentPolicyWarning) {
    warningMessages.push("Government or policy GameInfo API is unavailable.");
    nextActions.push(
      "Core advice can continue, but government and policy-card advice may be limited; manually confirm the active government and slotted policies if this warning persists after Sync Government/Policies."
    );
  }

  return {
    id: "lua-log",
    title: "Lua.log diagnostics",
    status: warningMessages.length > 0 ? "warn" : "pass",
    message:
      warningMessages.length > 0
        ? `Lua.log contains a complete, valid civ6-ai-copilot export. ${warningMessages.join(" ")}`
        : "Lua.log contains a complete, valid civ6-ai-copilot export.",
    nextAction: nextActions.length > 0 ? nextActions.join(" ") : undefined,
    details: diagnostics
  };
}

function findLatestLaunchBarDiagnostic(diagnostics: LogDiagnosticReport): Record<string, unknown> | undefined {
  return [...diagnostics.diagnostics]
    .reverse()
    .find((diagnostic) => diagnostic.payload.reason === "launchbar-unavailable" || diagnostic.payload.reason === "launchbar-attached")
    ?.payload;
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

function findLatestCompleteExport(parsedExports: ParsedExport[]): ParsedExport | undefined {
  return parsedExports
    .filter((candidate) => candidate.end && candidate.issues.length === 0)
    .sort((a, b) => Math.max(...a.lineNumbers) - Math.max(...b.lineNumbers))
    .at(-1);
}

type ExportCompletionDiagnostic =
  | { status: "pass" }
  | { status: "warn"; message: string; nextAction: string }
  | { status: "fail"; message: string; nextAction: string };

function diagnoseExportCompletionDiagnostic(
  diagnostics: LogDiagnosticReport,
  latestBegin?: SnapshotBegin
): ExportCompletionDiagnostic {
  if (!latestBegin) {
    return { status: "pass" };
  }

  const completion = diagnostics.latestExportCompletionDiagnostic;
  if (!completion) {
    return {
      status: "warn",
      message:
        'Lua.log is missing a matching CIV6_AI_COPILOT_DIAGNOSTIC reason="exported" completion marker for the latest export.',
      nextAction:
        'Use the current Mod build, click 汇总本回合 again, and confirm Lua.log includes reason="exported" with the same exportId and checksum.'
    };
  }

  const payload = completion.payload;
  const mismatches: string[] = [];
  if (typeof payload.exportId !== "string") {
    mismatches.push("exportId is missing");
  } else if (payload.exportId !== latestBegin.exportId) {
    mismatches.push(`exportId expected ${latestBegin.exportId} but got ${payload.exportId}`);
  }
  if (typeof payload.chunkCount !== "number") {
    mismatches.push("chunkCount is missing");
  } else if (payload.chunkCount !== latestBegin.chunkCount) {
    mismatches.push(`chunkCount expected ${latestBegin.chunkCount} but got ${payload.chunkCount}`);
  }
  if (typeof payload.byteLength !== "number") {
    mismatches.push("byteLength is missing");
  } else if (payload.byteLength !== latestBegin.byteLength) {
    mismatches.push(`byteLength expected ${latestBegin.byteLength} but got ${payload.byteLength}`);
  }
  if (typeof payload.checksumSha256 !== "string") {
    mismatches.push("checksumSha256 is missing");
  } else if (payload.checksumSha256 !== latestBegin.checksumSha256) {
    mismatches.push(`checksumSha256 expected ${latestBegin.checksumSha256} but got ${payload.checksumSha256}`);
  }

  if (mismatches.length > 0) {
    return {
      status: "fail",
      message: `Latest reason="exported" diagnostic does not match the latest complete export: ${mismatches.join("; ")}.`,
      nextAction: "Click 汇总本回合 again, then rerun bridge/doctor against the updated Lua.log before analyzing."
    };
  }

  return { status: "pass" };
}

type LuaRuntimeDiagnostic =
  | { status: "pass" }
  | { status: "fail"; message: string; nextAction: string };

function diagnoseLuaRuntimePayload(payload: Record<string, unknown> | undefined): LuaRuntimeDiagnostic {
  if (!payload) {
    return { status: "pass" };
  }

  const missing: string[] = [];
  if (payload.hasControls === false) {
    missing.push("Controls");
  }
  if (payload.hasGame === false) {
    missing.push("Game");
  }
  if (payload.hasPlayers === false) {
    missing.push("Players");
  }
  if (payload.hasMap === false) {
    missing.push("Map");
  }

  if (missing.length === 0) {
    return { status: "pass" };
  }

  return {
    status: "fail",
    message: `The Mod loaded, but required Civ6 UI runtime objects were unavailable: ${missing.join(", ")}.`,
    nextAction:
      "Confirm the Mod is enabled as an InGame UI context, start or load an actual game, then reopen Lua.log after the briefing panel appears."
  };
}

async function checkSnapshot(snapshotPath?: string): Promise<DoctorCheck> {
  if (!snapshotPath) {
    return {
      id: "snapshot",
      title: "Snapshot file",
      status: "skip",
      message: "No snapshot path or snapshot directory was provided.",
      nextAction: "After bridge runs, rerun doctor with --snapshot-dir <snapshot-dir> or --snapshot <latest.json>."
    };
  }

  try {
    await stat(snapshotPath);
  } catch {
    return {
      id: "snapshot",
      title: "Snapshot file",
      status: "warn",
      message: `Snapshot file does not exist: ${snapshotPath}`,
      nextAction: "Run bridge to create latest.json."
    };
  }

  let validation: SnapshotValidationResult;
  try {
    validation = await validateSnapshotFile(snapshotPath);
  } catch (error) {
    return {
      id: "snapshot",
      title: "Snapshot file",
      status: "fail",
      message: `Snapshot could not be parsed or validated: ${(error as Error).message}`,
      nextAction: "Regenerate the snapshot with bridge.",
      details: { snapshotPath }
    };
  }

  if (!validation.ok) {
    return {
      id: "snapshot",
      title: "Snapshot file",
      status: "fail",
      message: "Snapshot exists but failed schema or multiplayer fairness checks.",
      nextAction: "Do not use this snapshot for advice until validation passes.",
      details: { snapshotPath, validation }
    };
  }

  return {
    id: "snapshot",
    title: "Snapshot file",
    status: "pass",
    message: "Snapshot exists and passes schema/fairness validation.",
    details: { snapshotPath, validation }
  };
}

function resolveSnapshotPath(options: DoctorOptions): string | undefined {
  if (options.snapshot) {
    return options.snapshot;
  }
  if (options.snapshotDir) {
    return path.join(options.snapshotDir, "latest.json");
  }
  return undefined;
}

function summarize(checks: DoctorCheck[]): DoctorReport["summary"] {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 }
  );
}
