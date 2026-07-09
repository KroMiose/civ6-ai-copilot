import os from "node:os";
import path from "node:path";

export type Civ6PathPlatform = "win32" | "darwin" | "linux";

export interface Civ6AICopilotPathOptions {
  platform?: NodeJS.Platform | Civ6PathPlatform;
  homeDir?: string;
  civ6UserDataDir?: string;
  modsDir?: string;
  logsDir?: string;
  luaLogPath?: string;
  codexHome?: string;
  snapshotDir?: string;
  handoffDir?: string;
  question?: string;
  intents?: string[];
  requiredModules?: string[];
}

export interface Civ6AICopilotPaths {
  platform: Civ6PathPlatform;
  homeDir: string;
  civ6UserDataDir: string;
  modsDir: string;
  installModDir: string;
  logsDir: string;
  luaLogPath: string;
  moddingLogPath: string;
  userInterfaceLogPath: string;
  databaseLogPath: string;
  snapshotDir: string;
  handoffDir: string;
  codexHome: string;
  skillInstallDir: string;
  commands: {
    copilot: string;
    installModFromBundle: string;
    installSkill: string;
    validateInstalledSkill: string;
    offlineSmoke: string;
    bridgeOnce: string;
    bridgeWatch: string;
    doctor: string;
    preflight: string;
    handoff: string;
    evidenceDraft: string;
    evidenceFinalize: string;
    evidenceValidate: string;
  };
}

export function buildCiv6AICopilotPaths(options: Civ6AICopilotPathOptions = {}): Civ6AICopilotPaths {
  const platform = normalizePlatform(options.platform ?? os.platform());
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const homeDir = options.homeDir ?? defaultHomeDir(platform);
  const documentsDir = pathApi.join(homeDir, "Documents");
  const civ6UserDataDir = options.civ6UserDataDir ?? defaultCiv6UserDataDir(platform, homeDir);
  const modsDir = options.modsDir ?? defaultCiv6ModsDir(platform, civ6UserDataDir);
  const logsDir = options.logsDir ?? defaultCiv6LogsDir(platform, civ6UserDataDir);
  const luaLogPath = options.luaLogPath ?? pathApi.join(logsDir, "Lua.log");
  const moddingLogPath = pathApi.join(logsDir, "Modding.log");
  const userInterfaceLogPath = pathApi.join(logsDir, "UserInterface.log");
  const databaseLogPath = pathApi.join(logsDir, "Database.log");
  const snapshotDir = options.snapshotDir ?? pathApi.join(documentsDir, "civ6-ai-copilot-snapshots");
  const handoffDir = options.handoffDir ?? pathApi.join(documentsDir, "civ6-ai-copilot-handoff");
  const codexHome = options.codexHome ?? pathApi.join(homeDir, ".codex");
  const skillInstallDir = pathApi.join(codexHome, "skills", "civ6-ai-copilot");
  const analysisArgs = buildAnalysisArgs(options);
  const evidenceDraftPath = pathApi.join(documentsDir, "civ6-ai-copilot-manual-evidence-draft.json");
  const evidencePath = pathApi.join(documentsDir, "civ6-ai-copilot-manual-evidence.json");

  return {
    platform,
    homeDir,
    civ6UserDataDir,
    modsDir,
    installModDir: pathApi.join(modsDir, "civ6-ai-copilot"),
    logsDir,
    luaLogPath,
    moddingLogPath,
    userInterfaceLogPath,
    databaseLogPath,
    snapshotDir,
    handoffDir,
    codexHome,
    skillInstallDir,
    commands: {
      installModFromBundle: `npm run mod -- install --clean --mods-dir ${quoteArg(modsDir)}`,
      copilot: `npm run copilot -- ${analysisArgs}`,
      installSkill: `npm run skill:install -- --skills-dir ${quoteArg(pathApi.dirname(skillInstallDir))} --clean`,
      validateInstalledSkill: `npm run skill:validate-installed -- --skills-dir ${quoteArg(pathApi.dirname(skillInstallDir))}`,
      offlineSmoke: `npm run smoke:offline -- --output-dir ${quoteArg(pathApi.join(documentsDir, "civ6-ai-copilot-offline-smoke"))} --clean`,
      bridgeOnce: `npm run bridge -- --input-log ${quoteArg(luaLogPath)} --output-dir ${quoteArg(snapshotDir)}`,
      bridgeWatch: `npm run bridge -- --input-log ${quoteArg(luaLogPath)} --output-dir ${quoteArg(snapshotDir)} --watch`,
      doctor: `npm run doctor -- --input-log ${quoteArg(luaLogPath)} --modding-log ${quoteArg(moddingLogPath)} --user-interface-log ${quoteArg(userInterfaceLogPath)} --database-log ${quoteArg(databaseLogPath)} --snapshot-dir ${quoteArg(snapshotDir)} --format markdown`,
      preflight: `npm run preflight -- --snapshot-dir ${quoteArg(snapshotDir)} ${analysisArgs}`,
      handoff: `npm run handoff -- --snapshot-dir ${quoteArg(snapshotDir)} --output-dir ${quoteArg(handoffDir)} ${analysisArgs} --clean`,
      evidenceDraft: `npm run evidence:draft -- --input-log ${quoteArg(luaLogPath)} --snapshot-dir ${quoteArg(snapshotDir)} --handoff-dir ${quoteArg(handoffDir)} --output ${quoteArg(evidenceDraftPath)} --format markdown`,
      evidenceFinalize: `npm run evidence:finalize -- --input ${quoteArg(evidenceDraftPath)} --output ${quoteArg(evidencePath)} --confirm-windows-smoke --confirm-multiplayer-fairness --confirm-mac-codex-copilot --confirm-artifact-scope --civ6-build ${quoteArg("<civ6-build-id>")} --format markdown`,
      evidenceValidate: `npm run evidence:validate -- --evidence ${quoteArg(evidencePath)} --format markdown`
    }
  };
}

export function formatCiv6AICopilotPathsMarkdown(paths: Civ6AICopilotPaths): string {
  return [
    "# civ6-ai-copilot Paths",
    "",
    `- platform: ${paths.platform}`,
    `- homeDir: ${paths.homeDir}`,
    `- Civ6 user data root: ${paths.civ6UserDataDir}`,
    `- Mods dir: ${paths.modsDir}`,
    `- Install Mod dir: ${paths.installModDir}`,
    `- Logs dir: ${paths.logsDir}`,
    `- Lua.log: ${paths.luaLogPath}`,
    `- Modding.log: ${paths.moddingLogPath}`,
    `- UserInterface.log: ${paths.userInterfaceLogPath}`,
    `- Database.log: ${paths.databaseLogPath}`,
    `- Snapshot dir: ${paths.snapshotDir}`,
    `- Handoff dir: ${paths.handoffDir}`,
    `- Agent skill dir: ${paths.skillInstallDir}`,
    "",
    "## Commands",
    "",
    "Run these commands from `civ6-ai-copilot-release/tooling` or the project root after `npm install`. The standard Agent entry refreshes the current briefing, validates it, writes a handoff folder, and tells the Agent what to read.",
    "",
    "### Standard Agent Entry",
    "",
    "```bash",
    paths.commands.copilot,
    "```",
    "",
    "### Install/Validate Mod",
    "",
    "```bash",
    paths.commands.installModFromBundle,
    "```",
    "",
    "### Install/Validate Agent Skill",
    "",
    "Run this on the machine where Agent analysis will happen. The paths below use the platform/home shown at the top of this report; for a Windows game machine plus Mac Agent split, run this section on the Mac with the Mac Agent paths. It replaces stale pre-Mod civ6-ai-copilot skills with the Mod-first handoff workflow.",
    "",
    "```bash",
    paths.commands.installSkill,
    paths.commands.validateInstalledSkill,
    "```",
    "",
    "### Offline Smoke",
    "",
    "```bash",
    paths.commands.offlineSmoke,
    "```",
    "",
    "### Bridge Once",
    "",
    "```bash",
    paths.commands.bridgeOnce,
    "```",
    "",
    "### Bridge Watch",
    "",
    "```bash",
    paths.commands.bridgeWatch,
    "```",
    "",
    "### Doctor",
    "",
    "```bash",
    paths.commands.doctor,
    "```",
    "",
    "### Preflight",
    "",
    "```bash",
    paths.commands.preflight,
    "```",
    "",
    "### Windows To Mac Handoff",
    "",
    "```bash",
    paths.commands.handoff,
    "```",
    "",
    "### Manual Evidence Draft",
    "",
    "```bash",
    paths.commands.evidenceDraft,
    "```",
    "",
    "### Manual Evidence Finalize",
    "",
    "Run this only after real Windows smoke and two-player fairness tests are complete. Replace `<civ6-build-id>` with the Civilization VI build shown in the test environment.",
    "",
    "```bash",
    paths.commands.evidenceFinalize,
    "```",
    "",
    "### Manual Evidence Validate",
    "",
    "```bash",
    paths.commands.evidenceValidate,
    "```",
    ""
  ].join("\n");
}

export function formatCiv6AICopilotPathsPowerShell(paths: Civ6AICopilotPaths): string {
  const lines = [
    "# civ6-ai-copilot Windows smoke runbook",
    "# Generated by: npm run paths -- --platform win32 --format powershell",
    "# Run from the project root or from civ6-ai-copilot-release/tooling after npm install.",
    "",
    "$ErrorActionPreference = 'Stop'",
    "",
    "Write-Host '== civ6-ai-copilot Windows smoke preflight ==' -ForegroundColor Cyan",
    "node --version",
    "npm --version",
    "npm install",
    "npm run mod:validate",
    paths.commands.offlineSmoke,
    "",
    "Write-Host '== Install passive Civ6 UI Mod ==' -ForegroundColor Cyan",
    paths.commands.installModFromBundle,
    "",
    "Write-Host ''",
    "Write-Host 'Now start Civilization VI, open Additional Content, enable civ6-ai-copilot, then start or load a real game.' -ForegroundColor Yellow",
    "Write-Host 'In-game, confirm the Copilot icon button appears in the native left-top LaunchBar, open it, click 汇总本回合, then click at least one supplemental button such as 城市运营 or 科技市政.' -ForegroundColor Yellow",
    "Read-Host 'After the briefing panel says 简报已汇总 and the recent summary updates, press Enter here'",
    "",
    "Write-Host '== Assemble and validate the real Lua.log export ==' -ForegroundColor Cyan",
    paths.commands.copilot,
    paths.commands.bridgeOnce,
    paths.commands.doctor,
    paths.commands.preflight,
    paths.commands.handoff,
    paths.commands.evidenceDraft,
    "",
    "Write-Host ''",
    "Write-Host 'Smoke artifacts:' -ForegroundColor Cyan",
    `Write-Host ${psQuote(`Lua.log: ${paths.luaLogPath}`)}`,
    `Write-Host ${psQuote(`Snapshot dir: ${paths.snapshotDir}`)}`,
    `Write-Host ${psQuote(`Handoff dir: ${paths.handoffDir}`)}`,
    "Write-Host 'Next: fill tests/manual/windows-civ6-smoke-test.md, then run the two-player fairness test before evidence:finalize.' -ForegroundColor Yellow",
    ""
  ];
  return lines.join("\n");
}

function normalizePlatform(platform: NodeJS.Platform | Civ6PathPlatform): Civ6PathPlatform {
  if (platform === "win32" || platform === "darwin") {
    return platform;
  }
  return "linux";
}

function buildAnalysisArgs(options: Civ6AICopilotPathOptions): string {
  const intents = normalizedList(options.intents);
  const modules = normalizedList(options.requiredModules);
  const stableIntents = intents.length > 0 ? intents : ["turn-priority"];
  return [
    ...stableIntents.flatMap((intent) => ["--intent", quoteArg(intent)]),
    ...modules.flatMap((moduleName) => ["--module", quoteArg(moduleName)])
  ].join(" ");
}

function normalizedList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function defaultCiv6UserDataDir(platform: Civ6PathPlatform, homeDir: string): string {
  if (platform === "win32") {
    return path.win32.join(homeDir, "Documents", "My Games", "Sid Meier's Civilization VI");
  }
  if (platform === "darwin") {
    return path.posix.join(homeDir, "Library", "Application Support", "Sid Meier's Civilization VI");
  }
  return path.posix.join(homeDir, ".local", "share", "Aspyr", "Sid Meier's Civilization VI");
}

function defaultCiv6ModsDir(platform: Civ6PathPlatform, civ6UserDataDir: string): string {
  if (platform === "win32") {
    return path.win32.join(civ6UserDataDir, "Mods");
  }
  if (platform === "darwin") {
    return path.posix.join(civ6UserDataDir, "Sid Meier's Civilization VI", "Mods");
  }
  return path.posix.join(civ6UserDataDir, "Mods");
}

function defaultCiv6LogsDir(platform: Civ6PathPlatform, civ6UserDataDir: string): string {
  if (platform === "win32") {
    return path.win32.join(civ6UserDataDir, "Logs");
  }
  if (platform === "darwin") {
    return path.posix.join(civ6UserDataDir, "Firaxis Games", "Sid Meier's Civilization VI", "Logs");
  }
  return path.posix.join(civ6UserDataDir, "Logs");
}

function defaultHomeDir(platform: Civ6PathPlatform): string {
  if (platform === normalizePlatform(os.platform())) {
    return os.homedir();
  }

  const username = currentUsername();
  if (platform === "win32") {
    return path.win32.join("C:\\Users", username);
  }
  if (platform === "darwin") {
    return path.posix.join("/Users", username);
  }
  return path.posix.join("/home", username);
}

function currentUsername(): string {
  try {
    const username = os.userInfo().username.trim();
    if (username) {
      return username;
    }
  } catch {
    // Fall back to the current home basename when userInfo is unavailable.
  }

  return path.basename(os.homedir()) || "Player";
}

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
