import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runBridgeOnce } from "../tools/bridge/src/bridge.js";
import { buildSnapshotLogLinesWithCompletionDiagnostic } from "../tools/bridge/src/parser.js";
import { COPILOT_DIAGNOSTIC, COPILOT_LOADED } from "../tools/bridge/src/protocol.js";
import { createManualEvidenceDraft } from "../tools/release/src/manual-evidence-draft.js";
import { finalizeManualEvidence } from "../tools/release/src/manual-evidence-finalize.js";
import { validateManualEvidenceObject } from "../tools/release/src/manual-evidence.js";
import { createPassingManualEvidence } from "./manual-evidence-fixture.js";
import { PROTOCOL_VERSION, VERSION } from "../tools/project/src/version.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("manual evidence finalize turns an explicitly confirmed draft into RC-ready evidence", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-evidence-finalize-"));
  try {
    const { luaLogPath, snapshotDir, latestPath } = await writeBridgeFixture(tempDir);
    const draftPath = path.join(tempDir, "manual-evidence-draft.json");
    const finalPath = path.join(tempDir, "manual-evidence.json");

    await createManualEvidenceDraft({
      rootDir: path.resolve("."),
      inputLog: luaLogPath,
      snapshotDir,
      playerASnapshot: latestPath,
      playerBSnapshot: latestPath,
      outputPath: draftPath,
      civ6Build: "civ6-build-id"
    });

    const report = await finalizeManualEvidence({
      inputPath: draftPath,
      outputPath: finalPath,
      confirmWindowsSmoke: true,
      confirmMultiplayerFairness: true,
      confirmMacCodexCopilot: true,
      confirmArtifactScope: true,
      civ6Build: "civ6-build-id",
      modVersion: VERSION,
      notes: "Structured final manual-test conclusions."
    });

    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(report.validation.ok, true, JSON.stringify(report.validation, null, 2));
    await stat(finalPath);

    const saved = JSON.parse(await readFile(finalPath, "utf8"));
    assert.equal(saved.evidenceKind, "real-manual-test");
    assert.equal(saved.windowsSmoke.status, "pass");
    assert.equal(saved.windowsSmoke.modEnabledInAdditionalContent, true);
    assert.equal(saved.windowsSmoke.selectiveSyncExported, true);
    assert.equal(saved.windowsSmoke.luaLogLoaded, true);
    assert.equal(saved.multiplayerFairness.status, "pass");
    assert.equal(saved.multiplayerFairness.bothEnabledMod, true);
    assert.equal(saved.multiplayerFairness.playerA.localPlayerVerified, true);
    assert.equal(saved.multiplayerFairness.playerB.ownCitiesOnly, true);
    assert.equal(saved.macCodexCopilot.status, "pass");
    assert.equal(saved.macCodexCopilot.skillInstalledValidated, true);
    assert.equal(saved.macCodexCopilot.noBlindAnalysisWhenSyncRequired, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("manual evidence finalize requires explicit real-test confirmations", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-evidence-finalize-missing-"));
  try {
    const inputPath = path.join(tempDir, "manual-evidence-draft.json");
    const outputPath = path.join(tempDir, "manual-evidence.json");
    await writeFile(inputPath, `${JSON.stringify(createPassingManualEvidence(), null, 2)}\n`, "utf8");

    const report = await finalizeManualEvidence({
      inputPath,
      outputPath
    });

    assert.equal(report.ok, false);
    assert.deepEqual(report.missingConfirmations, [
      "--confirm-windows-smoke",
      "--confirm-multiplayer-fairness",
      "--confirm-mac-codex-copilot",
      "--confirm-artifact-scope"
    ]);
    await assert.rejects(() => stat(outputPath));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("manual evidence validation rejects real evidence with placeholder metadata", async () => {
  const evidence = createPassingManualEvidence();
  evidence.modVersion = "fill-after-real-test";
  const validation = await validateManualEvidenceObject(evidence);

  assert.equal(validation.ok, false);
  assert.equal(validation.policyIssues.some((issue) => issue.includes("modVersion must be replaced")), true);
});

async function writeBridgeFixture(tempDir: string): Promise<{ luaLogPath: string; snapshotDir: string; latestPath: string }> {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.exportedAt = new Date().toISOString();
  const luaLogPath = path.join(tempDir, "Lua.log");
  const snapshotDir = path.join(tempDir, "snapshots");
  const lines = [
    `${COPILOT_LOADED} version=${VERSION}`,
    `${COPILOT_DIAGNOSTIC} ${JSON.stringify({
      modVersion: VERSION,
      protocolVersion: PROTOCOL_VERSION,
      reason: "manual-evidence-finalize-test",
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
      exportId: "manual-evidence-finalize-export",
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
