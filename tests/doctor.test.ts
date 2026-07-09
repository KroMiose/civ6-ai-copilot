import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshotLogLines, buildSnapshotLogLinesWithCompletionDiagnostic } from "../tools/bridge/src/parser.js";
import { writeSnapshotOutputs } from "../tools/bridge/src/writer.js";
import { runDoctor } from "../tools/doctor/src/doctor.js";
import { VERSION } from "../tools/project/src/version.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("doctor passes repository checks when given a valid Lua.log and snapshot dir", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    const logPath = path.join(tempDir, "Lua.log");
    const logLines = [
      `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
      'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true}',
      ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, { exportId: "doctor-export", chunkSize: 256 })
    ];
    await writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");
    await writeSnapshotOutputs(snapshot, path.join(tempDir, "snapshots"), {
      exportId: "doctor-export",
      checksumSha256: "fixture-checksum"
    });

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath,
      snapshotDir: path.join(tempDir, "snapshots")
    });

    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(report.checks.find((check) => check.id === "lua-log")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "snapshot")?.status, "pass");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor warns when a valid Lua.log export is missing the exported completion diagnostic", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    const logPath = path.join(tempDir, "Lua.log");
    const logLines = [
      `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
      'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true}',
      ...buildSnapshotLogLines(snapshot, { exportId: "doctor-missing-completion-export", chunkSize: 256 })
    ];
    await writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    const luaLogCheck = report.checks.find((check) => check.id === "lua-log");
    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(luaLogCheck?.status, "warn");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor fails when the exported completion diagnostic does not match the latest export", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    const logPath = path.join(tempDir, "Lua.log");
    const snapshotLines = buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
      exportId: "doctor-current-export",
      chunkSize: 256
    }).map((line) =>
      line.includes('"reason":"exported"')
        ? line.replace('"exportId":"doctor-current-export"', '"exportId":"doctor-stale-export"')
        : line
    );
    const logLines = [
      `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
      'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true}',
      ...snapshotLines
    ];
    await writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    const luaLogCheck = report.checks.find((check) => check.id === "lua-log");
    assert.equal(report.ok, false);
    assert.equal(luaLogCheck?.status, "fail");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor warns when Mod is loaded but user has not clicked sync", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const logPath = path.join(tempDir, "Lua.log");
    await writeFile(
      logPath,
      [
        `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
        'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true}'
      ].join("\n"),
      "utf8"
    );

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(report.checks.find((check) => check.id === "lua-log")?.status, "warn");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor fails when Lua reports the LaunchBar Copilot button could not attach", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const logPath = path.join(tempDir, "Lua.log");
    await writeFile(
      logPath,
      [
        `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
        'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true}',
        'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"launchbar-unavailable"}'
      ].join("\n"),
      "utf8"
    );

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    const luaLogCheck = report.checks.find((check) => check.id === "lua-log");
    assert.equal(report.ok, false);
    assert.equal(luaLogCheck?.status, "fail");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor fails when Lua export self-tests fail", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const logPath = path.join(tempDir, "Lua.log");
    await writeFile(
      logPath,
      [
        `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
        'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":false}'
      ].join("\n"),
      "utf8"
    );

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    assert.equal(report.ok, false);
    assert.equal(report.checks.find((check) => check.id === "lua-log")?.status, "fail");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor fails when Civ6 UI runtime objects are unavailable", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const logPath = path.join(tempDir, "Lua.log");
    await writeFile(
      logPath,
      [
        `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
        'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true,"hasControls":false,"hasGame":true,"hasPlayers":true,"hasMap":true}'
      ].join("\n"),
      "utf8"
    );

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    const luaLogCheck = report.checks.find((check) => check.id === "lua-log");
    assert.equal(report.ok, false);
    assert.equal(luaLogCheck?.status, "fail");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor identifies Copilot UI XML loaded without the Lua marker", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-game-logs-"));
  try {
    const luaLogPath = path.join(tempDir, "Lua.log");
    const uiLogPath = path.join(tempDir, "UserInterface.log");
    const moddingLogPath = path.join(tempDir, "Modding.log");
    await writeFile(luaLogPath, "[123.000] unrelated Lua output\n", "utf8");
    await writeFile(uiLogPath, '[123.000] 43 controls in context "civ6_ai_copilot"\n', "utf8");
    await writeFile(
      moddingLogPath,
      [
        "[123.000] Loading Mod - C:/Users/Player/Documents/My Games/Sid Meier's Civilization VI/Mods/civ6-ai-copilot/civ6-ai-copilot.modinfo",
        "[123.000] 8d2f71ce-6b34-4dbf-92da-cf7c2e21d2b7 (civ6-ai-copilot)"
      ].join("\n"),
      "utf8"
    );

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: luaLogPath,
      userInterfaceLog: uiLogPath,
      moddingLog: moddingLogPath
    });

    const gameLogsCheck = report.checks.find((check) => check.id === "civ6-game-logs");
    assert.equal(report.ok, false);
    assert.equal(gameLogsCheck?.status, "fail", JSON.stringify(report, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor reports when Civ6 game logs do not show the Copilot Mod being scanned", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-game-logs-"));
  try {
    const luaLogPath = path.join(tempDir, "Lua.log");
    const moddingLogPath = path.join(tempDir, "Modding.log");
    await writeFile(luaLogPath, "[123.000] unrelated Lua output\n", "utf8");
    await writeFile(moddingLogPath, "[123.000] Loading Mod - some-other-mod.modinfo\n", "utf8");

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: luaLogPath,
      moddingLog: moddingLogPath
    });

    const gameLogsCheck = report.checks.find((check) => check.id === "civ6-game-logs");
    assert.equal(report.ok, false);
    assert.equal(gameLogsCheck?.status, "fail", JSON.stringify(report, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor reports Civ6 gameplay database validation failures before InGame UI loads", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-game-logs-"));
  try {
    const moddingLogPath = path.join(tempDir, "Modding.log");
    const databaseLogPath = path.join(tempDir, "Database.log");
    await writeFile(
      moddingLogPath,
      [
        "[123.000] 8d2f71ce-6b34-4dbf-92da-cf7c2e21d2b7 (civ6-ai-copilot)",
        "[124.000] LocalizedText - Loading text/civ6-ai-copilot-text.xml"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      databaseLogPath,
      [
        '[125.000] [Gameplay] ERROR: Invalid Reference on Units_XP2.UnitType - "UNIT_TREBUCHET" does not exist in Units',
        "[125.000] [Gameplay]: Failed Validation."
      ].join("\n"),
      "utf8"
    );

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      moddingLog: moddingLogPath,
      databaseLog: databaseLogPath
    });

    const gameLogsCheck = report.checks.find((check) => check.id === "civ6-game-logs");
    assert.equal(report.ok, false);
    assert.equal(gameLogsCheck?.status, "fail", JSON.stringify(report, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor warns when visible plot unit API is unavailable but export is valid", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    const logPath = path.join(tempDir, "Lua.log");
    const logLines = [
      `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
      'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true,"hasControls":true,"hasGame":true,"hasPlayers":true,"hasMap":true,"hasUnitsInPlot":false}',
      ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
        exportId: "doctor-visible-units-export",
        chunkSize: 256
      })
    ];
    await writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    const luaLogCheck = report.checks.find((check) => check.id === "lua-log");
    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(luaLogCheck?.status, "warn");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor warns when player resource API is unavailable but export is valid", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    const logPath = path.join(tempDir, "Lua.log");
    const logLines = [
      `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
      'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true,"hasControls":true,"hasGame":true,"hasPlayers":true,"hasMap":true,"hasUnitsInPlot":true,"hasPlayerResources":false,"hasGameInfoResources":true}',
      ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
        exportId: "doctor-resource-api-export",
        chunkSize: 256
      })
    ];
    await writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    const luaLogCheck = report.checks.find((check) => check.id === "lua-log");
    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(luaLogCheck?.status, "warn");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor warns when tech or civic progression API is unavailable but export is valid", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    const logPath = path.join(tempDir, "Lua.log");
    const logLines = [
      `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
      'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true,"hasControls":true,"hasGame":true,"hasPlayers":true,"hasMap":true,"hasUnitsInPlot":true,"hasPlayerResources":true,"hasGameInfoResources":true,"hasPlayerTechs":false,"hasGameInfoTechnologies":true,"hasPlayerCulture":true,"hasGameInfoCivics":true}',
      ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
        exportId: "doctor-progression-api-export",
        chunkSize: 256
      })
    ];
    await writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    const luaLogCheck = report.checks.find((check) => check.id === "lua-log");
    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(luaLogCheck?.status, "warn");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("doctor warns when government or policy GameInfo API is unavailable but export is valid", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-doctor-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    const logPath = path.join(tempDir, "Lua.log");
    const logLines = [
      `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
      'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true,"sha256SelfTest":true,"hasControls":true,"hasGame":true,"hasPlayers":true,"hasMap":true,"hasUnitsInPlot":true,"hasPlayerResources":true,"hasGameInfoResources":true,"hasPlayerTechs":true,"hasGameInfoTechnologies":true,"hasPlayerCulture":true,"hasGameInfoCivics":true,"hasGameInfoGovernments":false,"hasGameInfoPolicies":true,"hasGameInfoGovernmentSlots":true}',
      ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
        exportId: "doctor-government-policy-api-export",
        chunkSize: 256
      })
    ];
    await writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

    const report = await runDoctor({
      modSourceDir: path.resolve("mod"),
      inputLog: logPath
    });

    const luaLogCheck = report.checks.find((check) => check.id === "lua-log");
    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(luaLogCheck?.status, "warn");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
