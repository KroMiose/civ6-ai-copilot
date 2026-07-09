import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCiv6AICopilotPaths,
  formatCiv6AICopilotPathsPowerShell
} from "../tools/paths/src/civ6-paths.js";

test("paths helper prints Windows Civ6 and copilot paths with Windows separators", () => {
  const paths = buildCiv6AICopilotPaths({
    platform: "win32",
    homeDir: "C:\\Users\\Player",
    intents: ["war"]
  });

  assert.equal(paths.platform, "win32");
  assert.equal(paths.modsDir, "C:\\Users\\Player\\Documents\\My Games\\Sid Meier's Civilization VI\\Mods");
  assert.equal(paths.installModDir, `${paths.modsDir}\\civ6-ai-copilot`);
  assert.equal(paths.luaLogPath, "C:\\Users\\Player\\Documents\\My Games\\Sid Meier's Civilization VI\\Logs\\Lua.log");
  assert.equal(paths.snapshotDir, "C:\\Users\\Player\\Documents\\civ6-ai-copilot-snapshots");
  assert.equal(paths.handoffDir, "C:\\Users\\Player\\Documents\\civ6-ai-copilot-handoff");
  assert.equal(paths.skillInstallDir, "C:\\Users\\Player\\.codex\\skills\\civ6-ai-copilot");
  assert.equal(paths.moddingLogPath, "C:\\Users\\Player\\Documents\\My Games\\Sid Meier's Civilization VI\\Logs\\Modding.log");
  assert.equal(
    paths.userInterfaceLogPath,
    "C:\\Users\\Player\\Documents\\My Games\\Sid Meier's Civilization VI\\Logs\\UserInterface.log"
  );
  assert.equal(paths.databaseLogPath, "C:\\Users\\Player\\Documents\\My Games\\Sid Meier's Civilization VI\\Logs\\Database.log");
  assert.match(paths.commands.copilot, /npm run copilot -- --intent "war"/);
  assert.doesNotMatch(paths.commands.copilot, /--question/);
  assert.match(paths.commands.installModFromBundle, /npm run mod -- install --clean --mods-dir/);
  assert.match(paths.commands.installSkill, /npm run skill:install -- --skills-dir/);
  assert.match(paths.commands.installSkill, /C:\\Users\\Player\\.codex\\skills/);
  assert.match(paths.commands.validateInstalledSkill, /npm run skill:validate-installed -- --skills-dir/);
  assert.doesNotMatch(paths.commands.installModFromBundle, /Copy-Item|cp -R/);
  assert.match(paths.commands.offlineSmoke, /smoke:offline/);
  assert.match(paths.commands.bridgeOnce, /npm run bridge/);
  assert.doesNotMatch(paths.commands.bridgeOnce, /--watch/);
  assert.match(paths.commands.bridgeWatch, /Lua\.log/);
  assert.match(paths.commands.doctor, /snapshot-dir/);
  assert.match(paths.commands.doctor, /--modding-log/);
  assert.match(paths.commands.doctor, /--user-interface-log/);
  assert.match(paths.commands.doctor, /--database-log/);
  assert.match(paths.commands.doctor, /--format markdown/);
  assert.match(paths.commands.handoff, /civ6-ai-copilot-handoff/);
  assert.match(paths.commands.evidenceDraft, /--handoff-dir/);
  assert.match(paths.commands.evidenceFinalize, /--confirm-windows-smoke/);
  assert.match(paths.commands.evidenceValidate, /civ6-ai-copilot-manual-evidence\.json/);
});

test("paths helper accepts custom Civ6 data and Mods directories", () => {
  const paths = buildCiv6AICopilotPaths({
    platform: "win32",
    homeDir: "C:\\Users\\Player",
    civ6UserDataDir: "D:\\Civ6UserData",
    modsDir: "E:\\Civ6Mods"
  });

  assert.equal(paths.civ6UserDataDir, "D:\\Civ6UserData");
  assert.equal(paths.modsDir, "E:\\Civ6Mods");
  assert.equal(paths.installModDir, "E:\\Civ6Mods\\civ6-ai-copilot");
  assert.equal(paths.luaLogPath, "D:\\Civ6UserData\\Logs\\Lua.log");
  assert.match(paths.commands.installModFromBundle, /"E:\\Civ6Mods"/);
});

test("paths helper accepts custom Logs and Lua.log paths", () => {
  const paths = buildCiv6AICopilotPaths({
    platform: "darwin",
    homeDir: "/Users/player",
    logsDir: "/Volumes/Civ6Logs",
    luaLogPath: "/Volumes/Civ6Logs/current-Lua.log"
  });

  assert.equal(paths.logsDir, "/Volumes/Civ6Logs");
  assert.equal(paths.luaLogPath, "/Volumes/Civ6Logs/current-Lua.log");
  assert.equal(paths.moddingLogPath, "/Volumes/Civ6Logs/Modding.log");
  assert.equal(paths.userInterfaceLogPath, "/Volumes/Civ6Logs/UserInterface.log");
  assert.equal(paths.databaseLogPath, "/Volumes/Civ6Logs/Database.log");
  assert.match(paths.commands.bridgeOnce, /"\/Volumes\/Civ6Logs\/current-Lua\.log"/);
  assert.match(paths.commands.doctor, /"\/Volumes\/Civ6Logs\/current-Lua\.log"/);
  assert.match(paths.commands.doctor, /"\/Volumes\/Civ6Logs\/Modding\.log"/);
});

test("paths helper accepts custom Codex home for the copilot machine", () => {
  const paths = buildCiv6AICopilotPaths({
    platform: "darwin",
    homeDir: "/Users/player",
    codexHome: "/Volumes/CopilotCodexHome"
  });

  assert.equal(paths.codexHome, "/Volumes/CopilotCodexHome");
  assert.equal(paths.skillInstallDir, "/Volumes/CopilotCodexHome/skills/civ6-ai-copilot");
  assert.match(paths.commands.installSkill, /"\/Volumes\/CopilotCodexHome\/skills"/);
  assert.match(paths.commands.validateInstalledSkill, /"\/Volumes\/CopilotCodexHome\/skills"/);
});

test("paths helper uses target-platform home defaults when platform is overridden", () => {
  const paths = buildCiv6AICopilotPaths({ platform: "win32" });

  assert.match(paths.homeDir, /^[A-Z]:\\Users\\/);
  assert.match(paths.modsDir, /^[A-Z]:\\Users\\/);
  assert.doesNotMatch(paths.modsDir, /^\\Users\\/);
});

test("paths helper prints macOS and Linux Civ6 user-data candidates", () => {
  const mac = buildCiv6AICopilotPaths({ platform: "darwin", homeDir: "/Users/player" });
  assert.equal(mac.civ6UserDataDir, "/Users/player/Library/Application Support/Sid Meier's Civilization VI");
  assert.equal(
    mac.modsDir,
    "/Users/player/Library/Application Support/Sid Meier's Civilization VI/Sid Meier's Civilization VI/Mods"
  );
  assert.equal(
    mac.logsDir,
    "/Users/player/Library/Application Support/Sid Meier's Civilization VI/Firaxis Games/Sid Meier's Civilization VI/Logs"
  );
  assert.equal(
    mac.luaLogPath,
    "/Users/player/Library/Application Support/Sid Meier's Civilization VI/Firaxis Games/Sid Meier's Civilization VI/Logs/Lua.log"
  );
  assert.equal(
    mac.moddingLogPath,
    "/Users/player/Library/Application Support/Sid Meier's Civilization VI/Firaxis Games/Sid Meier's Civilization VI/Logs/Modding.log"
  );

  const linux = buildCiv6AICopilotPaths({ platform: "linux", homeDir: "/home/player" });
  assert.equal(linux.civ6UserDataDir, "/home/player/.local/share/Aspyr/Sid Meier's Civilization VI");
  assert.equal(linux.modsDir, "/home/player/.local/share/Aspyr/Sid Meier's Civilization VI/Mods");
});

test("paths helper can emit a Windows PowerShell smoke runbook", () => {
  const paths = buildCiv6AICopilotPaths({ platform: "win32", homeDir: "C:\\Users\\Player" });
  const script = formatCiv6AICopilotPathsPowerShell(paths);

  assert.match(script, /\$ErrorActionPreference = 'Stop'/);
  assert.match(script, /npm install/);
  assert.match(script, /npm run mod:validate/);
  assert.match(script, /npm run smoke:offline/);
  assert.match(script, /npm run mod -- install --clean --mods-dir/);
  assert.match(script, /npm run copilot -- --intent "turn-priority"/);
  assert.doesNotMatch(script, /--question/);
  assert.match(script, /npm run bridge -- --input-log/);
  assert.doesNotMatch(script, /npm run bridge -- .* --watch/);
  assert.match(script, /npm run doctor -- --input-log/);
  assert.match(script, /npm run handoff -- --snapshot-dir/);
  assert.match(script, /npm run evidence:draft -- --input-log/);
  assert.match(script, /tests\/manual\/windows-civ6-smoke-test\.md/);
});
