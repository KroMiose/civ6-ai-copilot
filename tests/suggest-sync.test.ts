import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Pure Node skill script is intentionally kept as .mjs for direct user execution.
import { buildSyncSuggestion, inferRequiredModules, inferRequiredModulesForIntents } from "../skill/scripts/suggest-sync.mjs";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("sync guidance maps war intent to units, map, cities, and public diplomacy", () => {
  const result = inferRequiredModulesForIntents(["war"]);
  assert.equal(result.requiredModules.includes("units"), true);
  assert.equal(result.requiredModules.includes("visibleMap"), true);
  assert.equal(result.requiredModules.includes("diplomacyPublic"), true);
});

test("sync guidance maps exploration intent to map and units without broad planning modules", () => {
  const result = inferRequiredModulesForIntents(["exploration"]);
  assert.deepEqual(result.scenarios, ["exploration"]);
  assert.deepEqual(result.requiredModules, ["meta", "localPlayer", "units", "visibleMap"]);
});

test("sync guidance accepts fixture for war intent because required modules exist", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const result = buildSyncSuggestion({ intents: ["war"], snapshot });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
});

test("sync guidance asks for policy modules when snapshot lacks them", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.modules = ["meta", "localPlayer", "cities"];
  const result = buildSyncSuggestion({ intents: ["policy"], snapshot });
  assert.equal(result.ok, false);
  assert.equal(result.missingModules.includes("government"), true);
  assert.equal(result.missingModules.includes("policies"), true);
  assert.equal(result.missingModules.includes("resources"), true);
  assert.match(result.recommendation, /左上副官入口/);
  assert.match(result.recommendation, /简报已汇总/);
});

test("sync guidance asks for map visibility for exploration intent when map and units are missing", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.modules = ["meta", "localPlayer", "cities"];
  const result = buildSyncSuggestion({ intents: ["exploration"], snapshot });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingModules, ["units", "visibleMap"]);
  assert.match(result.recommendation, /更新地图情报/);
});

test("sync guidance treats low-confidence public diplomacy as not enough for war intent", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.diplomacy.confidence = "low";
  const result = buildSyncSuggestion({ intents: ["war"], snapshot });
  assert.equal(result.ok, false);
  assert.deepEqual(result.lowConfidenceModules, ["diplomacyPublic"]);
});

test("sync guidance explains the in-game briefing flow when snapshot is missing", () => {
  const result = buildSyncSuggestion({ intents: ["war"] });
  assert.equal(result.ok, false);
  assert.match(result.recommendation, /左上副官入口/);
  assert.match(result.recommendation, /汇总本回合/);
  assert.match(result.recommendation, /npm run copilot/);
  assert.match(result.recommendation, /--intent "war"/);
});

test("legacy question inference remains a fallback, not the standard tool contract", () => {
  const result = inferRequiredModules("勇士应该往哪里探索？");
  assert.deepEqual(result.scenarios, ["exploration"]);
});
