import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCopilotPrepare } from "../tools/copilot/src/prepare.js";
import { buildSnapshotLogLines } from "../tools/bridge/src/parser.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("copilot prepare builds a ready handoff from the standard snapshot directory", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-prepare-snapshot-"));
  const handoffDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-prepare-handoff-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.exportedAt = new Date().toISOString();
    await writeLatestWithManifest(snapshotDir, snapshot, "prepare-export-0001");

    const report = await runCopilotPrepare({
      refreshMode: "none",
      snapshotDir,
      handoffDir,
      clean: true,
      intents: ["turn-priority"]
    });

    assert.equal(report.readyForCopilot, true, JSON.stringify(report, null, 2));
    assert.equal(report.refresh.attempted, false);
    assert.equal(report.handoff?.readyForCopilot, true);
    assert.match(report.nextActions[0], /codex-prompt\.md/);

    await readFile(path.join(handoffDir, "codex-prompt.md"), "utf8");
    await readFile(path.join(handoffDir, "copilot-handoff.md"), "utf8");
    await readFile(path.join(handoffDir, "latest.json"), "utf8");
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
    await rm(handoffDir, { recursive: true, force: true });
  }
});

test("copilot prepare refreshes from Lua.log on Windows-style auto mode", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-prepare-bridge-"));
  const snapshotDir = path.join(rootDir, "snapshots");
  const handoffDir = path.join(rootDir, "handoff");
  const luaLogPath = path.join(rootDir, "Lua.log");
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.exportedAt = new Date().toISOString();
    const logContent = `${buildSnapshotLogLines(snapshot, { exportId: "prepare-export-0002", chunkSize: 128 }).join("\n")}\n`;
    await writeFile(luaLogPath, logContent, "utf8");

    const report = await runCopilotPrepare({
      platform: "win32",
      homeDir: "C:\\Users\\Player",
      luaLogPath,
      snapshotDir,
      handoffDir,
      clean: true,
      intents: ["turn-priority"]
    });

    assert.equal(report.refresh.mode, "bridge");
    assert.equal(report.refresh.ok, true, JSON.stringify(report.refresh, null, 2));
    assert.equal(report.readyForCopilot, true, JSON.stringify(report, null, 2));

    const copiedSnapshot = JSON.parse(await readFile(path.join(handoffDir, "latest.json"), "utf8"));
    assert.equal(copiedSnapshot.source.exportId, "prepare-export-0002");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

async function writeLatestWithManifest(outputDir: string, snapshot: Record<string, unknown>, exportId: string): Promise<void> {
  snapshot.source = {
    ...(snapshot.source as Record<string, unknown>),
    exportId
  };
  const latestPath = path.join(outputDir, "latest.json");
  const manifestPath = path.join(outputDir, "latest-manifest.json");
  const jsonText = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(latestPath, jsonText, "utf8");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        exportId,
        checksumSha256: createHash("sha256").update(Buffer.from(jsonText, "utf8")).digest("hex"),
        latestPath,
        snapshotPath: latestPath,
        writtenAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
