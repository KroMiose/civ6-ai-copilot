import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergeSnapshotModules, MODULE_FIELDS } from "../tools/snapshot/src/module-cache.js";
import { validateSnapshotObject } from "../tools/snapshot/src/validate.js";
import { writeSnapshotOutputs } from "../tools/bridge/src/writer.js";
import { runCopilotPreflight } from "../tools/copilot/src/preflight.js";

const fixture = JSON.parse(await readFile("tests/fixtures/minimal-player-visible.snapshot.json", "utf8"));
function capture(modules: string[], turn = 42, exportId = "capture", capturedAt = new Date().toISOString()): any {
  const snapshot = structuredClone(fixture);
  snapshot.session.gameTurn = turn;
  snapshot.exportedAt = capturedAt;
  snapshot.source.exportId = exportId;
  snapshot.modules = ["meta", "localPlayer", "selection", ...modules];
  snapshot.moduleStatus = Object.fromEntries(snapshot.modules.map((m: string) => [m, { capturedTurn: turn, capturedAt, exportId }]));
  // Empty schema placeholders are explicitly unavailable modules.
  for (const [moduleName, field] of Object.entries(MODULE_FIELDS)) {
    if (!field || snapshot.modules.includes(moduleName) || field === "localPlayer") continue;
    if (Array.isArray(snapshot[field])) snapshot[field] = [];
    else if (snapshot[field]) {
      snapshot[field].confidence = "low";
      if (["governors", "trade", "cityStates"].includes(moduleName)) {
        snapshot[field].source = "inferred";
        snapshot[field].visibility = "player-visible";
        snapshot[field].availability = "unavailable";
      }
      for (const key of Object.keys(snapshot[field])) if (Array.isArray(snapshot[field][key])) snapshot[field][key] = [];
    }
  }
  return snapshot;
}

test("sequential topics retain current modules and replace whole arrays, including empty arrays", async () => {
  const map = capture(["visibleMap", "units"], 42, "map");
  const cities = capture(["cities"], 42, "cities");
  const combined = mergeSnapshotModules(map, cities);
  assert.deepEqual(combined.visibleMap, map.visibleMap);
  assert.deepEqual(combined.cities, cities.cities);
  assert.equal(combined.moduleStatus?.visibleMap.exportId, "map");
  assert.equal((await validateSnapshotObject(combined)).ok, true);
  const empty = capture(["cities"], 42, "empty"); empty.cities = [];
  assert.deepEqual(mergeSnapshotModules(combined, empty).cities, []);
});

test("new turn retains stale capture records without previous unit/map payload", () => {
  const result = mergeSnapshotModules(capture(["units", "visibleMap"]), capture(["cities"], 43));
  assert.equal(result.modules?.includes("units"), false);
  assert.equal(result.moduleStatus?.units.capturedTurn, 42);
  assert.deepEqual(result.units, []);
  assert.deepEqual((result.visibleMap as any).tiles, []);
});

test("cache never crosses sessions or players and rejects turn rollback", () => {
  const old = capture(["visibleMap"]);
  const otherSession = capture(["cities"]); otherSession.session.sessionId = "other-game";
  const otherPlayer = capture(["cities"]); otherPlayer.localPlayer.localPlayerId = 1;
  assert.equal(mergeSnapshotModules(old, otherSession).moduleStatus?.visibleMap, undefined);
  assert.equal(mergeSnapshotModules(old, otherPlayer).moduleStatus?.visibleMap, undefined);
  assert.throws(() => mergeSnapshotModules(old, capture(["cities"], 41)), /older turn/);
});

test("delayed cumulative payload cannot replace a more recent module", () => {
  const newer = capture(["cities"], 42, "new", "2026-09-25T10:10:00Z");
  const old = capture(["cities", "resources"], 42, "old", "2026-09-25T10:00:00Z");
  old.cities = [];
  assert.deepEqual(mergeSnapshotModules(newer, old).cities, newer.cities);
});

test("cache preserves and replaces whole first-batch domain modules", () => {
  const previous = capture(["governors"], 42, "governor-old");
  previous.governors.titlesAvailable = 1;
  const tradeRefresh = capture(["trade"], 42, "trade-refresh");
  const retained = mergeSnapshotModules(previous, tradeRefresh);
  assert.equal(retained.modules?.includes("governors"), true);
  assert.equal((retained.governors as any).titlesAvailable, 1);
  assert.equal(retained.moduleStatus?.governors.exportId, "governor-old");

  const governorRefresh = capture(["governors"], 42, "governor-new");
  governorRefresh.governors.titlesAvailable = 3;
  const replaced = mergeSnapshotModules(retained, governorRefresh);
  assert.equal((replaced.governors as any).titlesAvailable, 3);
  assert.equal(replaced.moduleStatus?.governors.exportId, "governor-new");
});

test("writer merges validated modules and preflight cannot refresh city age through a resource export", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "copilot-modules-"));
  try {
    await writeSnapshotOutputs(capture(["cities"], 42, "city-old", new Date(Date.now() - 3600000).toISOString()), dir, { exportId: "city-old" });
    await writeSnapshotOutputs(capture(["resources"], 42, "resource-new"), dir, { exportId: "resource-new" });
    const latest = JSON.parse(await readFile(path.join(dir, "latest.json"), "utf8"));
    assert.equal(latest.modules.includes("cities"), true);
    const report = await runCopilotPreflight({ snapshotDir: dir, requiredModules: ["cities"] });
    assert.equal(report.checks.manifestConsistent, true);
    assert.equal(report.checks.freshnessOk, false);
    assert.equal(report.canAnalyze, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("schema semantics reject a declared current module with an old stamp", async () => {
  const snapshot = capture(["cities"]);
  snapshot.moduleStatus.cities.capturedTurn--;
  const result = await validateSnapshotObject(snapshot);
  assert.equal(result.schemaOk, false);
  assert.match(result.schemaErrors.join(" "), /current snapshot turn/);
});
