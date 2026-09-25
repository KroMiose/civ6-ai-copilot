import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCopilotContext } from "../tools/copilot/src/context.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("context returns one ready payload without requiring handoff file reads", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-"));
  try {
    await writeLatest(snapshotDir, "context-export-0001");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      question: "我的政策卡怎么换？"
    });

    assert.equal(report.status, "ready", JSON.stringify(report, null, 2));
    assert.equal(report.identity?.exportId, "context-export-0001");
    assert.equal(report.analysis?.intents.includes("policy"), true);
    assert.ok(report.context?.government);
    assert.equal(report.context?.visibleMap, undefined);
    assert.equal("canonical" in report, false);
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("context automatically includes map evidence for exploration questions", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-map-"));
  try {
    await writeLatest(snapshotDir, "context-export-0002");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      question: "勇士下一步往哪里探索？"
    });

    assert.equal(report.status, "ready", JSON.stringify(report, null, 2));
    assert.equal(report.analysis?.intents.includes("exploration"), true);
    assert.ok(report.context?.units);
    assert.ok(report.context?.visibleMap);
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("context maps broad turn-planning questions to turn-priority with map evidence", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-turn-"));
  try {
    await writeLatest(snapshotDir, "context-export-turn");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      question: "这回合我应该先做什么？"
    });

    assert.equal(report.status, "ready", JSON.stringify(report, null, 2));
    assert.equal(report.analysis?.intents.includes("turn-priority"), true);
    assert.equal(report.analysis?.requiredModules.includes("visibleMap"), true);
    assert.ok(report.context?.visibleMap);
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("context refuses to silently fall back to stale analysis when refresh fails", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-fail-"));
  try {
    const report = await runCopilotContext({
      platform: "win32",
      homeDir: "C:\\Users\\Player",
      luaLogPath: path.join(rootDir, "missing-Lua.log"),
      snapshotDir: path.join(rootDir, "snapshots"),
      question: "这回合做什么？"
    });

    assert.equal(report.status, "needs-game-refresh");
    assert.equal(report.readyForCopilot, false);
    assert.equal(report.context, undefined);
    assert.equal(report.userActions.some((action) => action.includes("更新战情")), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

async function writeLatest(outputDir: string, exportId: string): Promise<void> {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.source = { ...snapshot.source, exportId };
  snapshot.exportedAt = new Date().toISOString();
  for (const capture of Object.values(snapshot.moduleStatus ?? {}) as Array<{ capturedAt: string }>) {
    capture.capturedAt = snapshot.exportedAt as string;
  }

  const latestPath = path.join(outputDir, "latest.json");
  const manifestPath = path.join(outputDir, "latest-manifest.json");
  const jsonText = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(latestPath, jsonText, "utf8");
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      exportId,
      checksumScope: "latest-json-file",
      checksumSha256: createHash("sha256").update(Buffer.from(jsonText, "utf8")).digest("hex"),
      latestPath,
      snapshotPath: latestPath,
      writtenAt: new Date().toISOString()
    }, null, 2)}\n`,
    "utf8"
  );
}
