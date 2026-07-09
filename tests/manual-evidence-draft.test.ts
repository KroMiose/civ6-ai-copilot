import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createManualEvidenceDraft } from "../tools/release/src/manual-evidence-draft.js";
import { validateManualEvidenceObject } from "../tools/release/src/manual-evidence.js";
import { runBridgeOnce } from "../tools/bridge/src/bridge.js";
import { buildSnapshotLogLinesWithCompletionDiagnostic } from "../tools/bridge/src/parser.js";
import { COPILOT_DIAGNOSTIC, COPILOT_LOADED } from "../tools/bridge/src/protocol.js";
import { runCopilotHandoff } from "../tools/copilot/src/handoff.js";
import { installSkill } from "../tools/skill-package/src/skill-package.js";
import { PROTOCOL_VERSION, VERSION } from "../tools/project/src/version.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("manual evidence draft prefills machine-proven Windows fields without claiming real evidence", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-evidence-draft-"));
  try {
    const { luaLogPath, snapshotDir } = await writeBridgeFixture(tempDir);
    const outputPath = path.join(tempDir, "manual-evidence-draft.json");

    const report = await createManualEvidenceDraft({
      rootDir: path.resolve("."),
      inputLog: luaLogPath,
      snapshotDir,
      outputPath,
      civ6Build: "civ6-build-id"
    });

    await stat(outputPath);
    const saved = JSON.parse(await readFile(outputPath, "utf8"));
    const validation = await validateManualEvidenceObject(saved);
    const windowsSmoke = saved.windowsSmoke;
    const macCodexCopilot = saved.macCodexCopilot;

    assert.equal(report.draftValidation.schemaOk, true, JSON.stringify(report, null, 2));
    assert.equal(validation.schemaOk, true, JSON.stringify(validation, null, 2));
    assert.equal(validation.artifactScopeOk, true, JSON.stringify(validation, null, 2));
    assert.equal(validation.realEvidence, false);
    assert.equal(saved.evidenceKind, "template");
    assert.equal(windowsSmoke.status, "not-run");
    assert.equal(windowsSmoke.civ6Build, "civ6-build-id");
    assert.equal(windowsSmoke.luaLogLoaded, true);
    assert.equal(windowsSmoke.controlsAvailable, true);
    assert.equal(windowsSmoke.gameApiAvailable, true);
    assert.equal(windowsSmoke.playersApiAvailable, true);
    assert.equal(windowsSmoke.mapApiAvailable, true);
    assert.equal(windowsSmoke.base64SelfTest, true);
    assert.equal(windowsSmoke.sha256SelfTest, true);
    assert.equal(windowsSmoke.hasPlayerResources, true);
    assert.equal(windowsSmoke.hasPlayerProgression, true);
    assert.equal(windowsSmoke.hasGovernmentPolicies, true);
    assert.deepEqual(report.machineChecks.windows.exportTypes, ["modules", "turn"]);
    assert.equal(windowsSmoke.syncCurrentTurnExported, true);
    assert.equal(windowsSmoke.selectiveSyncExported, true);
    assert.equal(windowsSmoke.bridgeLatestJson, true);
    assert.equal(windowsSmoke.preflightPassed, true);
    assert.equal(windowsSmoke.validatePassed, true);
    assert.equal(windowsSmoke.summarizePassed, true);
    assert.equal(windowsSmoke.renderMapPassed, true);
    assert.equal(windowsSmoke.doctorPassed, true);
    assert.equal(windowsSmoke.modEnabledInAdditionalContent, false);
    assert.equal(windowsSmoke.copilotButtonVisible, false);
    assert.equal(windowsSmoke.noGameplayMutationObserved, false);
    assert.equal(macCodexCopilot.status, "not-run");
    assert.equal(macCodexCopilot.skillInstalledValidated, false);
    assert.equal(macCodexCopilot.codexPromptReadFirst, false);
    assert.equal(report.nextActions.length > 0, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("manual evidence draft can prefill machine checks for two multiplayer snapshots", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-evidence-draft-mp-"));
  try {
    const { luaLogPath, snapshotDir, latestPath } = await writeBridgeFixture(tempDir);
    const outputPath = path.join(tempDir, "manual-evidence-draft.json");

    const report = await createManualEvidenceDraft({
      rootDir: path.resolve("."),
      inputLog: luaLogPath,
      snapshotDir,
      playerASnapshot: latestPath,
      playerBSnapshot: latestPath,
      outputPath
    });
    const saved = JSON.parse(await readFile(outputPath, "utf8"));
    const multiplayer = saved.multiplayerFairness;

    assert.equal(report.machineChecks.playerA?.validatePassed, true);
    assert.equal(report.machineChecks.playerB?.validatePassed, true);
    assert.equal(multiplayer.status, "not-run");
    assert.equal(multiplayer.bothEnabledMod, false);
    assert.equal(multiplayer.noDesyncObserved, false);
    assert.equal(multiplayer.playerA.validatePassed, true);
    assert.equal(multiplayer.playerA.preflightPassed, true);
    assert.equal(multiplayer.playerA.noHiddenMap, true);
    assert.equal(multiplayer.playerA.noInvisibleForeignUnits, true);
    assert.equal(multiplayer.playerA.localPlayerVerified, false);
    assert.equal(multiplayer.playerA.ownCitiesOnly, false);
    assert.equal(report.nextActions.length > 0, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("manual evidence draft can prefill Mac Codex handoff machine checks without claiming chat behavior", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-evidence-draft-handoff-"));
  const originalCodexHome = process.env.CODEX_HOME;
  try {
    process.env.CODEX_HOME = path.join(tempDir, "codex-home");
    const installResult = await installSkill({ sourceDir: path.resolve("skill"), clean: true });
    assert.equal(installResult.validation.ok, true, JSON.stringify(installResult.validation, null, 2));

    const { luaLogPath, snapshotDir } = await writeBridgeFixture(tempDir);
    const handoffDir = path.join(tempDir, "handoff");
    const question = "我现在该不该开战？";
    const handoff = await runCopilotHandoff({
      snapshotDir,
      outputDir: handoffDir,
      clean: true,
      question
    });
    assert.equal(handoff.readyForCopilot, true, JSON.stringify(handoff, null, 2));

    const outputPath = path.join(tempDir, "manual-evidence-draft.json");
    const report = await createManualEvidenceDraft({
      rootDir: path.resolve("."),
      inputLog: luaLogPath,
      snapshotDir,
      handoffDir,
      question,
      outputPath
    });
    const saved = JSON.parse(await readFile(outputPath, "utf8"));
    const macCodexCopilot = saved.macCodexCopilot;

    assert.equal(report.machineChecks.macCodexCopilot?.skillInstalledValidated, true);
    assert.equal(report.machineChecks.macCodexCopilot?.handoffGenerated, true);
    assert.equal(report.machineChecks.macCodexCopilot?.preflightPassed, true);
    assert.equal(report.machineChecks.macCodexCopilot?.summarizePassed, true);
    assert.equal(report.machineChecks.macCodexCopilot?.issues.length, 0);
    assert.equal(macCodexCopilot.status, "not-run");
    assert.equal(macCodexCopilot.skillInstalledValidated, true);
    assert.equal(macCodexCopilot.handoffGenerated, true);
    assert.equal(macCodexCopilot.snapshotValidatedOnCopilotMachine, true);
    assert.equal(macCodexCopilot.localVisibilityNoticeShown, true);
    assert.equal(macCodexCopilot.codexPromptReadFirst, false);
    assert.equal(macCodexCopilot.copilotHandoffRead, false);
    assert.equal(macCodexCopilot.syncBlockerHonored, false);
    assert.equal(macCodexCopilot.noBlindAnalysisWhenSyncRequired, false);
    assert.equal(macCodexCopilot.handoffScopeHonored, false);
    assert.equal(report.nextActions.length > 0, true);
  } finally {
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function writeBridgeFixture(tempDir: string): Promise<{ luaLogPath: string; snapshotDir: string; latestPath: string }> {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.exportedAt = new Date().toISOString();
  const modulesSnapshot = {
    ...snapshot,
    source: {
      ...snapshot.source,
      exportType: "modules"
    }
  };
  const luaLogPath = path.join(tempDir, "Lua.log");
  const snapshotDir = path.join(tempDir, "snapshots");
  const lines = [
    `${COPILOT_LOADED} version=${VERSION}`,
    `${COPILOT_DIAGNOSTIC} ${JSON.stringify({
      modVersion: VERSION,
      protocolVersion: PROTOCOL_VERSION,
      reason: "manual-evidence-draft-test",
      hasBitlib: true,
      base64SelfTest: true,
      sha256SelfTest: true,
      hasControls: true,
      hasGame: true,
      hasPlayers: true,
      hasMap: true,
      hasUnitsInPlot: true,
      hasPlayerResources: true,
      hasGameInfoResources: true,
      hasPlayerTechs: true,
      hasGameInfoTechnologies: true,
      hasPlayerCulture: true,
      hasGameInfoCivics: true,
      hasGameInfoGovernments: true,
      hasGameInfoPolicies: true,
      hasGameInfoGovernmentSlots: true,
      emittedAt: new Date(0).toISOString()
    })}`,
    ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
      exportId: "manual-evidence-draft-turn-export",
      chunkSize: 256
    }),
    ...buildSnapshotLogLinesWithCompletionDiagnostic(modulesSnapshot, {
      exportId: "manual-evidence-draft-modules-export",
      chunkSize: 256
    })
  ];
  await writeFile(luaLogPath, `${lines.join("\n")}\n`, "utf8");

  const bridge = await runBridgeOnce({
    inputLog: luaLogPath,
    outputDir: snapshotDir
  });
  assert.equal(bridge.ok, true, JSON.stringify(bridge, null, 2));
  assert.ok("written" in bridge && bridge.written);
  return {
    luaLogPath,
    snapshotDir,
    latestPath: bridge.written.latestPath
  };
}
