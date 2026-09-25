import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCopilotContext } from "../tools/copilot/src/context.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("context returns a decision brief instead of the raw export", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-"));
  try {
    await writeLatest(snapshotDir, "context-export-0001");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      question: "二城应该坐哪"
    });
    const encoded = JSON.stringify(report);

    assert.equal(report.status, "ready", encoded);
    assert.equal(report.identity?.exportId, "context-export-0001");
    assert.equal(report.brief?.cities[0]?.name, "Capital");
    assert.equal(report.brief?.policies.government, "Chiefdom");
    assert.equal(report.brief?.diplomacy[0]?.relationship, "at-war");
    assert.equal(encoded.includes("TERRAIN_GRASS"), false);
    assert.equal(report.brief?.map.exportedTiles, 2);
    assert.ok(report.gaps.some((gap) => gap.subject === "greatWorks" && gap.kind === "not-collected"));
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("the player question does not change the brief", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-query-"));
  try {
    await writeLatest(snapshotDir, "context-export-query");
    const settling = await runCopilotContext({ refreshMode: "none", snapshotDir, question: "二城应该坐哪" });
    const policy = await runCopilotContext({ refreshMode: "none", snapshotDir, question: "政策卡怎么换" });
    assert.deepEqual(settling.brief, policy.brief);
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("raw writes a file and does not inline the snapshot", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-raw-"));
  try {
    await writeLatest(snapshotDir, "context-export-raw");
    const report = await runCopilotContext({ refreshMode: "none", snapshotDir, raw: true });
    assert.equal(JSON.stringify(report).includes("TERRAIN_GRASS"), false);
    const raw = JSON.parse(await readFile(report.artifacts!.raw!.path, "utf8"));
    assert.equal(raw.visibleMap.tiles[0].terrainType, "TERRAIN_GRASS");
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
});

test("city and unit expansion keep non-zero player ids and one entity", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-expand-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.localPlayer.localPlayerId = 2;
    snapshot.units[0].ownerPlayerId = 2;
    snapshot.cities[0].ownerPlayerId = 2;
    await writeLatest(snapshotDir, "context-export-expand", snapshot);
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      city: "Capital",
      unit: "Archer"
    });
    assert.equal(report.brief?.player.id, 2);
    assert.equal(report.brief?.units.own[0]?.name, "Archer");
    assert.equal((report.detail?.city as { coverage?: string }).coverage, "1/1");
    assert.ok((report.detail?.city as { city?: { buildings?: unknown } }).city?.buildings);
    assert.equal((report.detail?.unit as { coverage?: string }).coverage, "1/2");
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
    assert.ok(report.brief?.cities[0]);
    const effects = report.gaps.map((gap) => `${gap.subject} ${gap.effect}`).join("\n");
    assert.match(effects, /governors/);
    assert.match(effects, /trade/);
    assert.match(effects, /cityStates/);
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
    const adjacent = report.detail?.adjacentUnits as Array<{ name?: string; x: number; y: number; adjacentTiles: Array<{ direction: string; x: number; y: number; terrainType?: string }> }>;
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

test("map levels use the requested radius and omit the full tile list", async () => {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-map-level-"));
  try {
    await writeLatest(snapshotDir, "context-export-levels");
    const report = await runCopilotContext({
      refreshMode: "none",
      snapshotDir,
      mapSpecs: ["world", "local:city:Capital", "region:unit:Archer:21", "local:city:不存在"]
    });

    assert.equal(report.status, "ready", JSON.stringify(report.gaps));
    assert.equal(JSON.stringify(report).includes("TERRAIN_GRASS"), false);
    const world = report.mapViews?.find((view) => view.level === "world");
    const local = report.mapViews?.find((view) => view.level === "local");
    const region = report.mapViews?.find((view) => view.level === "region");
    assert.equal(local?.radius, 5);
    assert.equal(region?.radius, 20);
    assert.equal(world?.places.tiles, undefined);
    assert.ok((local?.places.tiles as unknown[] | undefined)?.length);
    const effects = report.gaps.map((gap) => gap.effect).join("\n");
    assert.match(effects, /20/);
    assert.match(effects, /不存在/);
    assert.equal((await stat(local!.image.path)).isFile(), true);
    assert.equal((await readFile(local!.image.path)).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
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
    assert.equal(report.brief, undefined);
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
