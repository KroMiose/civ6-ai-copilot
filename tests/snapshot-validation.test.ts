import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFairnessChecks } from "../tools/snapshot/src/fairness.js";
import { validateSnapshotFile, validateSnapshotObject } from "../tools/snapshot/src/validate.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

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
