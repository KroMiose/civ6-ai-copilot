import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergeSnapshotModules, MODULE_FIELDS } from "../tools/snapshot/src/module-cache.js";
import { validateSnapshotObject } from "../tools/snapshot/src/validate.js";
import { writeSnapshotOutputs } from "../tools/bridge/src/writer.js";

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

test("latest completed export replaces the previous briefing, including an earlier reloaded turn", () => {
  const later = capture(["cities", "visibleMap"], 80, "later");
  const reloaded = capture(["units"], 55, "reloaded");
  const result = mergeSnapshotModules(later, reloaded);
  assert.equal(result.source?.exportId, "reloaded");
  assert.equal(result.session?.gameTurn, 55);
  assert.equal(result.modules?.includes("cities"), false);
  assert.equal(result.modules?.includes("visibleMap"), false);
  assert.deepEqual(result.units, reloaded.units);
});

test("writer stores the latest completed export without keeping the previous turn", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "copilot-modules-"));
  try {
    await writeSnapshotOutputs(capture(["cities", "visibleMap"], 80, "later"), dir, { exportId: "later" });
    await writeSnapshotOutputs(capture(["units"], 55, "reloaded"), dir, { exportId: "reloaded" });
    const latest = JSON.parse(await readFile(path.join(dir, "latest.json"), "utf8"));
    assert.equal(latest.source.exportId, "reloaded");
    assert.equal(latest.session.gameTurn, 55);
    assert.equal(latest.modules.includes("cities"), false);
    assert.equal(latest.modules.includes("visibleMap"), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("schema semantics reject a declared current module with an old stamp", async () => {
  const snapshot = capture(["cities"]);
  snapshot.moduleStatus.cities.capturedTurn--;
  const result = await validateSnapshotObject(snapshot);
  assert.equal(result.schemaOk, false);
  assert.match(result.schemaErrors.join(" "), /current snapshot turn/);
});
