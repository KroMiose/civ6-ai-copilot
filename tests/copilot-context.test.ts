import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCopilotContext } from "../tools/copilot/src/context.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("context returns the full latest export when the agent does not name modules", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-"));
  try {
    await writeLatest(snapshotDir, "context-export-0001");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      question: "二城应该坐哪"
    });

    assert.equal(report.status, "ready", JSON.stringify(report, null, 2));
    assert.equal(report.identity?.exportId, "context-export-0001");
    assert.ok(report.context?.cities);
    assert.ok(report.context?.visibleMap);
    assert.ok(report.context?.government);
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("the player question does not change which modules are returned", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-query-"));
  try {
    await writeLatest(snapshotDir, "context-export-query");
    const settling = await runCopilotContext({ refreshMode: "none", snapshotDir, question: "二城应该坐哪" });
    const policy = await runCopilotContext({ refreshMode: "none", snapshotDir, question: "政策卡怎么换" });
    assert.deepEqual(settling.modules, policy.modules);
    assert.deepEqual(Object.keys(settling.context ?? {}).sort(), Object.keys(policy.context ?? {}).sort());
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("context returns only the modules the agent selected", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-modules-"));
  try {
    await writeLatest(snapshotDir, "context-export-modules");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      modules: ["cities", "units", "visibleMap", "resources"]
    });

    assert.equal(report.status, "ready");
    assert.ok(report.context?.cities);
    assert.ok(report.context?.units);
    assert.ok(report.context?.visibleMap);
    assert.equal(report.context?.government, undefined);
    assert.equal(report.context?.techs, undefined);
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("unavailable requested modules stay in a ready result as gaps", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-gap-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.governors.availability = "unavailable";
    snapshot.trade.availability = "unavailable";
    snapshot.cityStates.availability = "unavailable";
    await writeLatest(snapshotDir, "context-export-gap", snapshot);
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      question: "这回合先做什么",
      modules: ["cities", "governors", "trade", "cityStates"]
    });

    assert.equal(report.status, "ready", JSON.stringify(report, null, 2));
    assert.ok(report.context?.cities);
    assert.match(report.gaps.join("\n"), /governors/);
    assert.match(report.gaps.join("\n"), /trade/);
    assert.match(report.gaps.join("\n"), /cityStates/);
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("adjacent-units uses odd-r neighbors from the current export", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-adjacent-"));
  try {
    await writeLatest(snapshotDir, "context-export-adjacent");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      modules: ["units", "visibleMap"],
      adjacentUnits: true
    });
    const adjacent = report.context?.adjacentUnits as Array<{ name?: string; x: number; y: number; adjacentTiles: Array<{ direction: string; x: number; y: number; terrainType?: string }> }>;
    const archer = adjacent.find((unit) => unit.name === "Archer");
    assert.ok(archer);
    assert.equal(archer.y % 2, 0);
    const west = archer.adjacentTiles.find((tile) => tile.direction === "左侧");
    assert.deepEqual({ x: west?.x, y: west?.y, terrainType: west?.terrainType }, { x: 12, y: 18, terrainType: "TERRAIN_GRASS" });
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("render-map writes an svg for the same export", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-map-"));
  try {
    const snapshotDir = path.join(rootDir, "snapshots");
    const mapPath = path.join(rootDir, "visible-map.svg");
    await writeLatest(snapshotDir, "context-export-map");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      modules: ["visibleMap"],
      renderMapPath: mapPath
    });
    assert.equal(report.status, "ready", JSON.stringify(report, null, 2));
    assert.equal(report.artifacts?.visibleMap?.path, mapPath);
    const svg = await stat(mapPath);
    assert.equal(svg.isFile(), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("a missing log is a runtime error and does not return an old analysis", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-fail-"));
  try {
    const report = await runCopilotContext({
      platform: "win32",
      homeDir: "C:\\Users\\Player",
      luaLogPath: path.join(rootDir, "missing-Lua.log"),
      snapshotDir: path.join(rootDir, "snapshots"),
      question: "这回合做什么？"
    });

    assert.equal(report.status, "runtime-error");
    assert.equal(report.readyForCopilot, false);
    assert.equal(report.context, undefined);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

async function writeLatest(outputDir: string, exportId: string, source?: Record<string, unknown>): Promise<void> {
  const snapshot = source ?? JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.source = { ...(snapshot.source as Record<string, unknown>), exportId };
  snapshot.exportedAt = new Date().toISOString();
  for (const capture of Object.values(snapshot.moduleStatus ?? {}) as Array<{ capturedAt: string }>) {
    capture.capturedAt = snapshot.exportedAt as string;
  }
  await mkdirLatest(outputDir, snapshot, exportId);
}

async function mkdirLatest(outputDir: string, snapshot: Record<string, unknown>, exportId: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(outputDir, { recursive: true });
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
