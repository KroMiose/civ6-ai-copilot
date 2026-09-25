import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFairnessChecks } from "../tools/snapshot/src/fairness.js";
import { validateSnapshotFile, validateSnapshotObject } from "../tools/snapshot/src/validate.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("fog tiles reject every current Plot field while explored coordinates remain valid", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const fog = { source: "fixture", visibility: "revealed", confidence: "confirmed", x: 1, y: 1, revealed: true, visibleNow: false };
  snapshot.visibleMap.tiles = [fog];
  assert.equal((await validateSnapshotObject(snapshot)).ok, true);
  for (const [field, value] of Object.entries({ ownerPlayerId: 1, resourceAmount: 1, resourceType: "RESOURCE_IRON", improvementType: "IMPROVEMENT_MINE", routeType: "ROUTE_ANCIENT_ROAD", districtType: "DISTRICT_CAMPUS", appeal: 4, yields: { YIELD_FOOD: 2 }, featureType: "FEATURE_FOREST", terrainType: "TERRAIN_GRASS" })) {
    snapshot.visibleMap.tiles = [{ ...fog, [field]: value }];
    const result = await validateSnapshotObject(snapshot);
    assert.equal(result.fairnessOk, false, field);
  }
});

test("hidden resources cannot leak an amount and unexplored tiles are rejected", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.visibleMap.tiles[0].resourceAmount = 2;
  assert.equal((await validateSnapshotObject(snapshot)).fairnessOk, false);
  snapshot.visibleMap.tiles[0].resourceType = "RESOURCE_IRON";
  assert.equal((await validateSnapshotObject(snapshot)).fairnessOk, true);
  snapshot.visibleMap.tiles[0].revealed = false;
  assert.equal((await validateSnapshotObject(snapshot)).fairnessOk, false);
});

test("notifications cannot be declared without an implemented contract", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.modules.push("notifications");
  assert.equal((await validateSnapshotObject(snapshot)).schemaOk, false);
});

test("visible foreign units cannot carry private movement or experience and cities are local only", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const privateUnitFields: Record<string, unknown> = {
    movesRemaining: 1,
    maxMoves: 2,
    range: 2,
    buildCharges: 1,
    experience: 7,
    experienceForNextLevel: 15,
    level: 2,
    promotions: [{ type: "PROMOTION_VOLLEY" }],
    militaryFormation: "corps",
    upgradeCost: 60
  };
  for (const [field, value] of Object.entries(privateUnitFields)) {
    snapshot.units[1][field] = value;
    const result = await validateSnapshotObject(snapshot);
    assert.equal(result.fairnessOk, false, field);
    assert.equal(result.fairnessIssues.some((issue) => issue.path === `$.units[1].${field}`), true, field);
    delete snapshot.units[1][field];
  }
  snapshot.cities[0].ownerPlayerId = 1;
  assert.equal((await validateSnapshotObject(snapshot)).fairnessOk, false);
});

test("minimal player-visible fixture passes schema and fairness validation", async () => {
  const result = await validateSnapshotFile(fixturePath);
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
});

test("fairness checks reject forbidden private/hidden keys", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.hiddenMap = { tiles: [] };

  const issues = runFairnessChecks(snapshot);
  assert.equal(issues.some((issue) => issue.path === "$.hiddenMap"), true);
});

test("fairness checks reject non-local units that are not visible now", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.units[1].visibility = "revealed";

  const result = await validateSnapshotObject(snapshot);
  assert.equal(result.ok, false);
  assert.equal(
    result.fairnessIssues.some((issue) => issue.path === "$.units[1].visibility"),
    true,
    JSON.stringify(result.fairnessIssues, null, 2)
  );
});

test("fairness checks reject raw numeric visible map resource indexes", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.visibleMap.tiles[0].resourceType = "43";

  const result = await validateSnapshotObject(snapshot);
  assert.equal(result.ok, false);
  assert.equal(
    result.fairnessIssues.some((issue) => issue.path === "$.visibleMap.tiles[0].resourceType"),
    true,
    JSON.stringify(result.fairnessIssues, null, 2)
  );
});

test("fairness checks reject raw numeric visible map terrain and feature indexes", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.visibleMap.tiles[0].terrainType = "3";
  snapshot.visibleMap.tiles[0].featureType = "2";

  const result = await validateSnapshotObject(snapshot);
  assert.equal(result.ok, false);
  assert.equal(
    result.fairnessIssues.some((issue) => issue.path === "$.visibleMap.tiles[0].terrainType"),
    true,
    JSON.stringify(result.fairnessIssues, null, 2)
  );
  assert.equal(
    result.fairnessIssues.some((issue) => issue.path === "$.visibleMap.tiles[0].featureType"),
    true,
    JSON.stringify(result.fairnessIssues, null, 2)
  );
});

test("fairness checks reject raw numeric city production hashes", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.cities[0].currentProduction = {
    type: "1872107673",
    name: "1872107673"
  };

  const result = await validateSnapshotObject(snapshot);
  assert.equal(result.ok, false);
  assert.equal(
    result.fairnessIssues.some((issue) => issue.path === "$.cities[0].currentProduction.type"),
    true,
    JSON.stringify(result.fairnessIssues, null, 2)
  );
  assert.equal(
    result.fairnessIssues.some((issue) => issue.path === "$.cities[0].currentProduction.name"),
    true,
    JSON.stringify(result.fairnessIssues, null, 2)
  );
});
