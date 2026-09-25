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

test("summary priority ranking selects actionable cities and units independent of source order", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const city = snapshot.cities[0];
  snapshot.cities = Array.from({ length: 12 }, (_, index) => ({ ...city, id: `city-${index}`, name: `city-${index}`, housing: 20, turnsUntilComplete: 8 }));
  snapshot.cities[11] = { ...snapshot.cities[11], name: "urgent-city", currentProduction: { type: "NO_PRODUCTION" } };
  snapshot.cities[10] = { ...snapshot.cities[10], name: "starving-city", turnsUntilStarvation: 1 };
  const unit = snapshot.units[0];
  snapshot.units = Array.from({ length: 12 }, (_, index) => ({ ...unit, id: `unit-${index}`, name: `unit-${index}`, movesRemaining: 0, damage: 0 }));
  snapshot.units[11] = { ...snapshot.units[11], name: "urgent-unit", damage: 80 };
  snapshot.visibleMap.tiles = Array.from({ length: 16 }, (_, index) => visibleTile(index, 5, "TERRAIN_GRASS", undefined, "RESOURCE_IRON"));
  const before = structuredClone(snapshot);
  const summary = await summarizeSnapshotObject(snapshot);
  assert.deepEqual(snapshot, before, "ranking must not mutate input");
  assert.match(summary.highlights.cities[0], /starving-city/);
  assert.match(summary.highlights.cities[1], /urgent-city/);
  assert.match(summary.highlights.units[0], /urgent-unit/);
  snapshot.cities.reverse(); snapshot.units.reverse(); snapshot.visibleMap.tiles.reverse();
  const reversed = await summarizeSnapshotObject(snapshot);
  assert.deepEqual(reversed.highlights, summary.highlights);
});

test("summary never treats previous-turn payload as current and requires foreign coverage for war", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.modules = snapshot.modules.filter((name: string) => name !== "cities");
  snapshot.moduleStatus.cities.capturedTurn--;
  snapshot.cities[0].name = "stale-city";
  snapshot.moduleStatus.units.scope = "own-only";
  snapshot.units = snapshot.units.filter((unit: any) => unit.ownerPlayerId === snapshot.localPlayer.localPlayerId);
  const summary = await summarizeSnapshotObject(snapshot, { intents: ["war"] });
  assert.equal(summary.coverage.counts.cities, 0);
  assert.equal(summary.coverage.staleModules.includes("cities"), true);
  assert.equal(summary.syncAdvice.staleModules.includes("cities"), true);
  assert.deepEqual(summary.syncAdvice.limitedModules, ["units"]);
  assert.doesNotMatch(summary.highlights.cities.join(" "), /stale-city/);
  assert.match(summary.syncAdvice.recommendation, /更新战情/);
});

test("ordinary summary needs no map, reports economy and available policy effects", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.modules = snapshot.modules.filter((name: string) => name !== "visibleMap");
  delete snapshot.moduleStatus.visibleMap;
  const summary = await summarizeSnapshotObject(snapshot);
  assert.equal(summary.syncAdvice.ok, true);
  assert.equal(summary.syncAdvice.requiredModules.includes("visibleMap"), false);
  assert.equal(summary.syncAdvice.requiredModules.includes("notifications"), false);
  assert.match(summary.highlights.economy.join(" "), /净金币\/回合：9/);
  assert.match(summary.highlights.government.join(" "), /可用政策/);
});

test("summary includes new own-player facts and prioritizes bounded domain highlights deterministically", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.selection.city = { status: "selected", id: "city-0-100" };
  snapshot.selection.unit = { status: "selected", id: "unit-0-200" };
  snapshot.cities[0].underSiege = true;
  snapshot.governors.governors = Array.from({ length: 7 }, (_, index) => ({
    type: `GOVERNOR_${index}`,
    name: `Governor ${index}`,
    appointed: true,
    established: true,
    status: "established",
    turnsUntilEstablished: 9
  }));
  snapshot.governors.governors[6] = {
    type: "GOVERNOR_WAITING",
    name: "Waiting Governor",
    appointed: false,
    status: "needs-assignment"
  };
  const before = structuredClone(snapshot);
  const summary = await summarizeSnapshotObject(snapshot);
  assert.deepEqual(snapshot, before, "bounded summary ordering must not mutate source data");
  assert.match(summary.highlights.selection.join(" "), /Capital/);
  assert.match(summary.highlights.selection.join(" "), /Archer/);
  assert.match(summary.highlights.cities.join(" "), /正在被围城/);
  assert.match(summary.highlights.cities.join(" "), /区域 City Center（已建）/);
  assert.match(summary.highlights.units.join(" "), /经验 7\/15/);
  assert.match(summary.highlights.units.join(" "), /编队 standard/);
  assert.match(summary.highlights.governors[0], /Waiting Governor/);
  assert.doesNotMatch(summary.highlights.governors[0], /Governor 6/);
  assert.match(summary.highlights.trade.join(" "), /空位 1/);
  assert.match(summary.highlights.cityStates.join(" "), /Geneva/);
  snapshot.governors.governors.reverse();
  const reversed = await summarizeSnapshotObject(snapshot);
  assert.deepEqual(reversed.highlights.governors, summary.highlights.governors);
});

test("governor summary distinguishes remaining travel from base establishment time", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.governors.governors = [
    { type: "GOVERNOR_TRAVELING", name: "Traveling", appointed: true, status: "transitioning", turnsUntilEstablished: 2 },
    { type: "GOVERNOR_BASE_TIME", name: "Base Time", appointed: true, status: "transitioning", turnsToEstablish: 5 },
    { type: "GOVERNOR_ESTABLISHED", name: "Established", appointed: true, status: "established", turnsUntilEstablished: 1 }
  ];
  const text = (await summarizeSnapshotObject(snapshot)).highlights.governors.join(" ");
  assert.match(text, /剩余 2 回合就职/);
  assert.match(text, /基础就职耗时 5 回合/);
  assert.doesNotMatch(text, /Established[^;]*剩余/);
});

test("domain not-applicable does not block while unavailable is explicit and blocks", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.governors.availability = "not-applicable";
  const notApplicable = await summarizeSnapshotObject(snapshot, { intents: ["policy"] });
  assert.equal(notApplicable.syncAdvice.ok, true);
  assert.equal(notApplicable.syncAdvice.notApplicableModules.includes("governors"), true);
  assert.match(notApplicable.highlights.governors.join(" "), /当前规则不适用/);

  snapshot.governors.availability = "unavailable";
  snapshot.governors.governors = [];
  const unavailable = await summarizeSnapshotObject(snapshot, { requiredModules: ["governors"] });
  assert.equal(unavailable.syncAdvice.ok, false);
  assert.equal(unavailable.syncAdvice.missingModules.includes("governors"), true);
  assert.equal(unavailable.syncAdvice.unavailableModules.includes("governors"), true);
  assert.match(unavailable.syncAdvice.recommendation, /不能将其当作空结果/);
  assert.match(unavailable.highlights.governors.join(" "), /不能据此判断没有总督/);
});

test("missing optional domain values are described as unknown rather than false or zero", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  delete snapshot.trade.activeCount;
  delete snapshot.trade.capacity;
  delete snapshot.trade.routes;
  delete snapshot.cityStates.cityStates[0].isSuzerain;
  delete snapshot.cityStates.cityStates[0].quests;
  const summary = await summarizeSnapshotObject(snapshot);
  assert.match(summary.highlights.trade.join(" "), /容量或已用数量未知/);
  assert.match(summary.highlights.trade.join(" "), /路线列表未知/);
  assert.match(summary.highlights.cityStates.join(" "), /宗主状态未知/);
  assert.match(summary.highlights.cityStates.join(" "), /任务状态未知/);
});
