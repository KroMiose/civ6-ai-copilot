import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeSnapshotFile,
  summarizeSnapshotObject
} from "../tools/copilot/src/summarize-snapshot.js";
import { readFile } from "node:fs/promises";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("copilot summary extracts validated fixture facts", async () => {
  const summary = await summarizeSnapshotFile(fixturePath, { intents: ["war"] });

  assert.equal(summary.validation.ok, true, JSON.stringify(summary.validation, null, 2));
  assert.equal(summary.snapshot.gameTurn, 42);
  assert.equal(summary.localPlayer.leaderType, "LEADER_HAMMURABI");
  assert.equal(summary.localPlayer.civilizationType, "CIVILIZATION_BABYLON_STK");
  assert.equal(summary.coverage.counts.cities, 1);
  assert.equal(summary.coverage.counts.ownUnits, 1);
  assert.equal(summary.coverage.counts.visibleForeignUnits, 1);
  assert.equal(summary.coverage.counts.visibleTiles, 2);
  assert.equal(summary.syncAdvice.ok, true);
  assert.equal(summary.highlights.map.some((line) => line.includes("淡水") && line.includes("河流边")), true);
  assert.equal(summary.highlights.map.some((line) => line.includes("产出") && line.includes("食物=2")), true);
});

test("copilot summary reports Civ6 screen-adjacent tiles around own units", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.units = [
    {
      source: "fixture",
      visibility: "own",
      confidence: "confirmed",
      id: "unit-0-warrior",
      type: "UNIT_WARRIOR",
      name: "勇士",
      ownerPlayerId: 0,
      x: 46,
      y: 22,
      damage: 0,
      movesRemaining: 2
    }
  ];
  snapshot.visibleMap.bounds = { minX: 45, maxX: 48, minY: 21, maxY: 23 };
  snapshot.visibleMap.tiles = [
    visibleTile(46, 22, "TERRAIN_GRASS", "FEATURE_FLOODPLAINS_GRASSLAND"),
    visibleTile(45, 23, "TERRAIN_GRASS", "FEATURE_FLOODPLAINS_GRASSLAND"),
    visibleTile(46, 23, "TERRAIN_GRASS", "FEATURE_FLOODPLAINS_GRASSLAND", "RESOURCE_RICE"),
    visibleTile(45, 22, "TERRAIN_GRASS", "FEATURE_FLOODPLAINS_GRASSLAND"),
    visibleTile(47, 22, "TERRAIN_GRASS", "FEATURE_FOREST", "RESOURCE_DEER"),
    visibleTile(45, 21, "TERRAIN_COAST"),
    visibleTile(46, 21, "TERRAIN_PLAINS", "FEATURE_JUNGLE"),
    visibleTile(47, 23, "TERRAIN_GRASS_HILLS")
  ];

  const summary = await summarizeSnapshotObject(snapshot, { intents: ["exploration"] });
  const adjacentLine = summary.highlights.map.find((line) => line.includes("单位相邻地块")) ?? "";

  assert.match(adjacentLine, /勇士 @ \(46, 22\)/);
  assert.match(adjacentLine, /右上 \(46, 23\)：草原，草原泛滥平原，水稻/);
  assert.match(adjacentLine, /右侧 \(47, 22\)：草原，森林，鹿/);
  assert.doesNotMatch(adjacentLine, /右上 \(47, 23\)/);
});

test("copilot summary asks for panel sync when intent-critical modules are missing", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.modules = ["meta", "localPlayer", "cities"];
  const summary = await summarizeSnapshotObject(snapshot, {
    intents: ["policy"],
    allowInvalid: true
  });

  assert.equal(summary.syncAdvice.ok, false);
  assert.equal(summary.syncAdvice.missingModules.includes("government"), true);
  assert.equal(summary.syncAdvice.missingModules.includes("policies"), true);
  assert.match(summary.syncAdvice.recommendation, /左上副官入口/);
  assert.match(summary.syncAdvice.recommendation, /简报已汇总/);
});

function visibleTile(x: number, y: number, terrainType: string, featureType?: string, resourceType?: string): Record<string, unknown> {
  const tile: Record<string, unknown> = {
    source: "fixture",
    visibility: "visible-now",
    confidence: "confirmed",
    x,
    y,
    revealed: true,
    visibleNow: true,
    terrainType
  };
  if (featureType) {
    tile.featureType = featureType;
  }
  if (resourceType) {
    tile.resourceType = resourceType;
  }
  return tile;
}
