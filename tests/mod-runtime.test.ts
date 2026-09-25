import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assembleLatestCompleteExport, parseLogContent } from "../tools/bridge/src/parser.js";
import { validateSnapshotObject } from "../tools/snapshot/src/validate.js";

const exports = ["collectSnapshot", "mergeCapturedModules", "withCoreModules", "createVisibleMapCollector", "attachLaunchButton", "collectCities", "collectUnits", "collectSelection", "unitSnapshotEntry", "collectGovernment", "collectEconomy", "collectProgression", "jsonEncode", "syncTurn", "syncVisibleMap", "stepActiveSyncJob", "tryAutoSyncTurn", "onCopilotUpdate", "toggleAutoSync", "setAutoSyncStatus", "setSyncProgress", "clearSyncProgress", "setStatus", "startSyncJob"];
async function runLua(body: string): Promise<string> {
  const source = await readFile("mod/ui/civ6_ai_copilot.lua", "utf8");
  const mocks = await readFile("tests/fixtures/mod-runtime-mocks.lua", "utf8");
  const testable = source.replace(/initialize\(\)\s*$/, `return { ${exports.map((name) => `${name} = ${name}`).join(", ")} }`);
  assert.notEqual(testable, source);
  const dir = await mkdtemp(path.join(os.tmpdir(), "copilot-lua-test-"));
  try {
    const script = path.join(dir, "test.lua");
    await writeFile(script, `${mocks}\nlocal function loadMod()\n${testable}\nend\nlocal api = loadMod()\n${body}\nprint("LUA_TEST_OK")\n`);
    const output = execFileSync(process.execPath, ["node_modules/fengari-node-cli/src/lua-cli.js", script], { encoding: "utf8", timeout: 30000 });
    // Fengari can return exit 0 after a Lua assertion failure; require our end marker.
    assert.match(output, /LUA_TEST_OK/);
    return output;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test("Lua Huge-map selection prioritizes distant visible front, never reads fog or hidden-resource quantity", async () => {
  const output = await runLua(`
local collector = api.createVisibleMapCollector(0)
while not collector:step(96) do end
local map, units, unverified = collector:result()
assert(#map.tiles == 1024 and map.truncated and map.revealedTileCount == 10399)
assert(resourceHandles == 1 and yieldEnumerations == 1 and resourceCountReads == 0)
assert(plotReads == 12 and forbiddenPlotReads == 0 and #units == 1 and units[1].id == "unit-1-2" and not unverified)
assert(units[1].movesRemaining == nil and units[1].combatStrength == nil and units[1].range == nil and units[1].promotions == nil)
assert(foreignUnitFieldReads == 0)
local front, fog = 0, 0
for _, tile in ipairs(map.tiles) do
  assert(not (tile.x == 0 and tile.y == 0))
  assert(tile.resourceType == nil and tile.resourceAmount == nil)
  if tile.visibleNow then front = front + 1 else
    fog = fog + 1
    for key in pairs(tile) do assert(({x=true,y=true,source=true,visibility=true,confidence=true,revealed=true,visibleNow=true})[key], key) end
  end
end
assert(front == 12 and fog == 1012)
resourceVisible = true
local nextCollector = api.createVisibleMapCollector(0)
while not nextCollector:step(96) do end
assert(resourceHandles == 2 and yieldEnumerations == 1 and resourceCountReads == 12)
local nextMap = nextCollector:result()
assert(nextMap.tiles[1].resourceType == "RESOURCE_TEST" and nextMap.tiles[1].resourceAmount == 7)
local snapshot = api.collectSnapshot("modules", api.withCoreModules({"units"}))
snapshot.modules[#snapshot.modules+1] = "visibleMap"
snapshot.visibleMap = map
snapshot.units[#snapshot.units+1] = units[1]
api.mergeCapturedModules(snapshot, "own-and-visible")
print("SNAPSHOT " .. api.jsonEncode(snapshot))
`);
  const snapshot = JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith("SNAPSHOT "))!.slice(9));
  const validation = await validateSnapshotObject(snapshot);
  assert.equal(validation.ok, true, JSON.stringify(validation));
});

test("Lua rechecks visibility at detail time and fails closed without unit visibility API", async () => {
  await runLua(`
local collector = api.createVisibleMapCollector(0)
while collector.phase == "scan" do collector:step(96) end
visibility.IsVisible = function() return false end
while not collector:step(96) do end
assert(plotReads == 0 and forbiddenPlotReads == 0)
local map, units = collector:result()
assert(#units == 0 and map.tiles[1].visibleNow == false)
visibility.IsVisible = function() return true end
visibility.IsUnitVisible = nil
local nextCollector = api.createVisibleMapCollector(0)
while not nextCollector:step(96) do end
local _, nextUnits, unverified = nextCollector:result()
assert(#nextUnits == 0 and unverified)
`);
});

test("Lua topics merge within a turn, age across turns, and emit valid lightweight protocol without SHA", async () => {
  const output = await runLua(`
local function capture(modules) return api.mergeCapturedModules(api.collectSnapshot("modules", api.withCoreModules(modules))) end
local first = capture({"cities"})
local second = capture({"resources", "economy"})
assert(#second.cities == 1 and second.moduleStatus.cities.exportId == first.source.exportId)
assert(second.moduleStatus.selection.exportId == second.source.exportId)
assert(first.source.exportId ~= second.source.exportId and first.session.sessionId == second.session.sessionId)
turn = 43
local third = capture({"resources", "economy"})
assert(#third.cities == 0 and third.moduleStatus.cities.capturedTurn == 42)
assert(third.moduleStatus.selection.capturedTurn == 43)
for _, name in ipairs(third.modules) do assert(name ~= "cities") end
assert(third.session.sessionId == first.session.sessionId)
api.syncTurn()
assert(plotReads == 0)
`);
  const assembled = assembleLatestCompleteExport(parseLogContent(output));
  const validation = await validateSnapshotObject(assembled.snapshot);
  assert.equal(validation.ok, true, JSON.stringify(validation));
  const snapshot = assembled.snapshot as any;
  assert.equal(snapshot.modules.includes("visibleMap"), false);
  assert.equal(snapshot.modules.includes("notifications"), false);
  assert.equal(snapshot.moduleStatus.units.scope, "own-only");
  assert.equal(snapshot.economy.goldPerTurn, 11);
  assert.equal(snapshot.cities[0].yields.YIELD_FOOD, 2);
  assert.equal(snapshot.modules.includes("selection"), true);
  assert.equal(snapshot.selection.city.status, "none");
  assert.equal(snapshot.selection.unit.status, "none");
  assert.equal(snapshot.selection.city.id, null);
  assert.equal(snapshot.selection.unit.id, null);
  assert.equal(snapshot.cities[0].foodStock, 20);
  assert.equal(snapshot.cities[0].foodSurplus, 4);
  assert.equal(snapshot.cities[0].growthThreshold, 50);
  assert.equal(snapshot.cities[0].underSiege, true);
  assert.equal(snapshot.cities[0].populationLimitedDistrictsUsed, 1);
  assert.equal(snapshot.cities[0].populationLimitedDistrictsCapacity, 2);
  assert.equal(snapshot.cities[0].buildings[0].type, "BUILDING_TEST");
  assert.equal(snapshot.cities[0].districts[0].type, "DISTRICT_TEST");
  assert.equal(snapshot.units[0].rangedStrength, 30);
  assert.equal(snapshot.units[0].range, 2);
  assert.equal(snapshot.units[0].maxMoves, 3);
  assert.equal(snapshot.units[0].buildCharges, 4);
  assert.equal(snapshot.units[0].experience, 15);
  assert.equal(snapshot.units[0].experienceForNextLevel, 30);
  assert.equal(snapshot.units[0].level, 2);
  assert.equal(snapshot.units[0].militaryFormation, "standard");
  assert.equal(snapshot.units[0].upgradeCost, 75);
  assert.equal(snapshot.units[0].promotions[0].type, "PROMOTION_TEST");
  assert.equal(snapshot.modules.includes("governors"), true);
  assert.equal(snapshot.modules.includes("trade"), true);
  assert.equal(snapshot.modules.includes("cityStates"), true);
  assert.equal(snapshot.moduleStatus.selection.capturedTurn, 43);
  assert.equal(snapshot.governors.availability, "unavailable");
  assert.equal(snapshot.trade.availability, "unavailable");
  assert.equal(snapshot.cityStates.availability, "unavailable");
  assert.equal(snapshot.governors.governors, undefined);
  assert.equal(snapshot.trade.routes, undefined);
  assert.equal(snapshot.cityStates.cityStates, undefined);
  assert.equal(snapshot.techs.currentProgress, 10);
  assert.equal(snapshot.civics.currentCost, 40);
  assert.equal(snapshot.government.availablePolicies.length, 1);
  assert.doesNotMatch(output, /checksumSha256|sha256SelfTest|localPlayerNameHash/);
});

test("Lua API gaps omit unavailable decisions and growth sentinels", async () => {
  await runLua(`
productionHash, growthTurns, starvationTurns = 0, -1, 2
local cities = api.collectCities(0)
assert(cities[1].currentProduction.type == "NO_PRODUCTION")
assert(cities[1].turnsUntilGrowth == nil and cities[1].turnsUntilStarvation == 2)
culture.IsPolicyUnlocked = nil
local government = api.collectGovernment(0)
assert(government.availablePolicies == nil and government.confidence == "low")
assert(government.canChangePolicies == nil)
treasury.GetTotalMaintenance = nil
local economy = api.collectEconomy(0)
assert(economy.goldPerTurn == nil and economy.confidence == "low")
localId = -1
assert(api.syncTurn() == false)
`);
});

test("Lua missing decision helpers or collectors omit unknown lists and keep snapshots valid", async () => {
  const output = await runLua(`
local domainModules = {"governors", "trade", "cityStates"}
Civ6CopilotDecisionData.collectGovernors = nil
Civ6CopilotDecisionData.collectTrade = nil
Civ6CopilotDecisionData.collectCityStates = nil
local missingCollectors = api.mergeCapturedModules(api.collectSnapshot("modules", api.withCoreModules(domainModules)))
assert(missingCollectors.governors.availability == "unavailable" and missingCollectors.governors.governors == nil)
assert(missingCollectors.trade.availability == "unavailable" and missingCollectors.trade.routes == nil)
assert(missingCollectors.cityStates.availability == "unavailable" and missingCollectors.cityStates.cityStates == nil)
print("MISSING_COLLECTORS " .. api.jsonEncode(missingCollectors))

Civ6CopilotDecisionData = nil
include = nil
local missingHelperApi = loadMod()
local missingHelper = missingHelperApi.mergeCapturedModules(
  missingHelperApi.collectSnapshot("modules", missingHelperApi.withCoreModules(domainModules))
)
assert(missingHelper.governors.availability == "unavailable" and missingHelper.governors.governors == nil)
assert(missingHelper.trade.availability == "unavailable" and missingHelper.trade.routes == nil)
assert(missingHelper.cityStates.availability == "unavailable" and missingHelper.cityStates.cityStates == nil)
print("MISSING_HELPER " .. missingHelperApi.jsonEncode(missingHelper))
`);
  for (const marker of ["MISSING_COLLECTORS ", "MISSING_HELPER "]) {
    const line = output.split(/\r?\n/).find((item) => item.startsWith(marker));
    assert.ok(line, `expected serialized snapshot for ${marker}`);
    const snapshot = JSON.parse(line.slice(marker.length)) as any;
    const validation = await validateSnapshotObject(snapshot);
    assert.equal(validation.ok, true, JSON.stringify(validation, null, 2));
  }
});

test("Lua collects selection, city operations, and own-unit decision fields from native getters", async () => {
  await runLua(`
selectedCity, selectedUnit = city, ownUnit
local snapshot = api.collectSnapshot("full", api.withCoreModules({"cities", "units", "selection"}))
local cityEntry, unitEntry = snapshot.cities[1], snapshot.units[1]
assert(snapshot.selection.city.status == "selected" and snapshot.selection.city.id == "city-0-1")
assert(snapshot.selection.unit.status == "selected" and snapshot.selection.unit.id == "unit-0-1")
assert(cityEntry.currentProductionProgress == 12 and cityEntry.currentProductionCost == 40)
assert(cityEntry.foodStock == 20 and cityEntry.foodSurplus == 4 and cityEntry.growthThreshold == 50)
assert(cityEntry.populationLimitedDistrictsUsed == 1 and cityEntry.populationLimitedDistrictsCapacity == 2)
assert(cityEntry.underSiege == true and cityEntry.buildings[1].type == "BUILDING_TEST" and cityEntry.districts[1].type == "DISTRICT_TEST" and cityEntry.districts[1].isBuilt == true)
assert(unitEntry.range == 2 and unitEntry.maxMoves == 3 and unitEntry.buildCharges == 4)
assert(unitEntry.experience == 15 and unitEntry.experienceForNextLevel == 30 and unitEntry.level == 2)
assert(unitEntry.militaryFormation == "standard" and unitEntry.upgradeCost == 75)
assert(unitEntry.promotions[1].type == "PROMOTION_TEST")
assert(cityEntry.source == "lua-api" and cityEntry.visibility == "own" and cityEntry.confidence == "confirmed")
assert(unitEntry.source == "lua-api" and unitEntry.visibility == "own" and unitEntry.confidence == "confirmed")
`);
});

test("Lua omits negative own-unit sentinels and keeps the snapshot schema-valid", async () => {
  const output = await runLua(`
ownUnit.GetCombat = function() return -1 end
ownUnit.GetRangedCombat = function() return -1 end
ownUnit.GetBombardCombat = function() return -1 end
ownUnit.GetRange = function() return -1 end
ownUnit.GetMaxMoves = function() return -1 end
ownUnit.GetBuildCharges = function() return -1 end
ownUnit.GetUpgradeCost = function() return -1 end
ownUnit.GetExperience = function()
  return {
    GetExperiencePoints = function() return -1 end,
    GetExperienceForNextLevel = function() return -1 end,
    GetLevel = function() return -1 end,
    GetPromotions = function() return {} end
  }
end
local snapshot = api.mergeCapturedModules(api.collectSnapshot("modules", api.withCoreModules({"units"})))
assert(snapshot.units[1].combatStrength == nil and snapshot.units[1].rangedStrength == nil and snapshot.units[1].bombardStrength == nil)
assert(snapshot.units[1].range == nil and snapshot.units[1].maxMoves == nil and snapshot.units[1].buildCharges == nil)
assert(snapshot.units[1].experience == nil and snapshot.units[1].experienceForNextLevel == nil and snapshot.units[1].level == nil)
assert(snapshot.units[1].upgradeCost == nil)
print("NEGATIVE_SENTINELS " .. api.jsonEncode(snapshot))
`);
  const line = output.split(/\r?\n/).find((item) => item.startsWith("NEGATIVE_SENTINELS "));
  assert.ok(line, "expected serialized sentinel snapshot");
  const snapshot = JSON.parse(line.slice("NEGATIVE_SENTINELS ".length)) as any;
  const validation = await validateSnapshotObject(snapshot);
  assert.equal(validation.ok, true, JSON.stringify(validation, null, 2));
});

test("Lua distinguishes an empty selection from unsupported or failing UI getters and omits missing city/unit APIs", async () => {
  await runLua(`
local noSelection = api.collectSelection(0)
assert(noSelection.city.status == "none" and noSelection.unit.status == "none")
assert(noSelection.source == "lua-api" and noSelection.visibility == "own" and noSelection.confidence == "confirmed")
assert(api.jsonEncode(noSelection):find('"id":null'))
UI.GetHeadSelectedCity = nil
local unavailable = api.collectSelection(0)
assert(unavailable.city.status == "unsupported" and unavailable.confidence == "low" and api.jsonEncode(unavailable):find("null"))
UI.GetHeadSelectedUnit = function() error("read failed") end
local failed = api.collectSelection(0)
assert(failed.unit.status == "error" and api.jsonEncode(failed):find("null"))
city.GetBuildings, city.GetDistricts = nil, nil
city.GetGrowth = nil
local cities = api.collectCities(0)
assert(cities[1].buildings == nil and cities[1].districts == nil)
assert(cities[1].foodStock == nil and cities[1].foodSurplus == nil and cities[1].growthThreshold == nil)
ownUnit.GetRange, ownUnit.GetMaxMoves, ownUnit.GetBuildCharges, ownUnit.GetUpgradeCost = nil, nil, nil, nil
ownUnit.GetExperience, ownUnit.GetMilitaryFormation = nil, nil
local units = api.collectUnits(0)
assert(units[1].range == nil and units[1].maxMoves == nil and units[1].buildCharges == nil)
assert(units[1].upgradeCost == nil and units[1].experience == nil and units[1].promotions == nil)
`);
});

test("Lua maps foreign selections to empty own selection and never reads foreign private unit fields", async () => {
  await runLua(`
selectedCity = { GetOwner = function() return 1 end, GetID = function() return 9 end }
selectedUnit = foreignUnit
local selection = api.collectSelection(0)
assert(selection.city.status == "none" and api.jsonEncode(selection):find("null"))
assert(selection.unit.status == "none" and api.jsonEncode(selection):find("null"))
local foreign = api.unitSnapshotEntry(foreignUnit, 1, "visible-now", "confirmed")
for _, field in ipairs({"range", "maxMoves", "buildCharges", "experience", "experienceForNextLevel", "level", "promotions", "militaryFormation", "upgradeCost"}) do
  assert(foreign[field] == nil, field)
end
assert(foreignUnitFieldReads == 0)
foreignUnit.GetOriginalOwner = function() return 15 end
local levied = api.unitSnapshotEntry(foreignUnit, 1, "visible-now", "confirmed")
assert(levied.isLevied == true and levied.originalOwnerPlayerId == 15)
assert(levied.range == nil and levied.movesRemaining == nil)
`);
});

test("Lua omits incomplete building and district lists after a failed getter or unresolved type", async () => {
  await runLua(`
buildingQueryFails = true
local citiesWithBuildingGap = api.collectCities(0)
assert(citiesWithBuildingGap[1].buildings == nil)
buildingQueryFails = false
local unresolvedDistrict = { GetType = function() return 999 end }
city.GetDistricts = function()
  return {
    Members = function() return ipairs({district, unresolvedDistrict}) end,
    HasDistrict = function() return true end,
    GetNumZonedDistrictsRequiringPopulation = function() return 2 end,
    GetNumAllowedDistrictsRequiringPopulation = function() return 3 end
  }
end
local citiesWithDistrictGap = api.collectCities(0)
assert(citiesWithDistrictGap[1].districts == nil)
`);
});

test("Lua preserves a genuinely empty city building or district collection", async () => {
  await runLua(`
cityBuildings.HasBuilding = function() return false end
city.GetDistricts = function()
  return {
    Members = function() return function() return nil end end,
    GetNumZonedDistrictsRequiringPopulation = function() return 0 end,
    GetNumAllowedDistrictsRequiringPopulation = function() return 1 end
  }
end
local empty = api.collectCities(0)[1]
assert(type(empty.buildings) == "table" and #empty.buildings == 0)
assert(type(empty.districts) == "table" and #empty.districts == 0)
`);
});

test("Lua LaunchBar reload hides actual stale controls and exposes exactly one button/pin", async () => {
  await runLua(`
local controls = {}
local stack = { CalculateSize = function() end, GetSizeX = function() return 100 end,
  DestroyChild = function() error("must not destroy instance tables") end }
ContextPtr = {
  LookUpControl = function(_, name) if name:find("ButtonStack") then return stack end end,
  BuildInstanceForControl = function(_, name, instance)
    local control = { hidden = false, SetHide = function(self, value) self.hidden = value end, RegisterCallback = function() end }
    if name == "Civ6AICopilotLaunchItem" then instance.CopilotButton = control else instance.CopilotPin = control end
    controls[#controls+1] = control
  end
}
api.attachLaunchButton()
api.attachLaunchButton()
assert(#controls == 2)
local reloaded = loadMod()
reloaded.attachLaunchButton()
assert(#controls == 4 and controls[1].hidden and controls[2].hidden)
assert(not controls[3].hidden and not controls[4].hidden)
`);
});

test("Lua aborts multi-frame export after turn change", async () => {
  const output = await runLua(`
ContextPtr = { SetUpdate = function() end, ClearUpdate = function() end }
api.syncVisibleMap()
api.stepActiveSyncJob()
turn = turn + 1
api.stepActiveSyncJob()
`);
  assert.match(output, /export-aborted-context-changed/);
  assert.doesNotMatch(output, /CIV6_AI_COPILOT_SNAPSHOT_BEGIN/);
});

test("automatic local turn schedules one delayed full briefing including budgeted visible map", async () => {
  const output = await runLua(`
local now = os.time()
os.time = function() return now end
local updateCallback
ContextPtr = {
  SetUpdate = function(_, callback) updateCallback = callback end,
  ClearUpdate = function() updateCallback = nil end
}
api.toggleAutoSync()
assert(api.tryAutoSyncTurn() == true)
assert(updateCallback ~= nil and plotReads == 0)
now = now + 1
  updateCallback()
  assert(plotReads == 0)
  now = now + 1
  updateCallback()
  assert(updateCallback ~= nil)
  assert(api.tryAutoSyncTurn() == false)
  assert(api.startSyncJob("modules", api.withCoreModules({"cities"}), "manual-busy") == false)
  while updateCallback do updateCallback() end
  assert(api.tryAutoSyncTurn() == false)
`);
  const parsed = assembleLatestCompleteExport(parseLogContent(output));
  const snapshot = parsed.snapshot as any;
  assert.equal(snapshot.modules.includes("visibleMap"), true);
  assert.equal(snapshot.modules.includes("governors"), true);
  assert.equal(snapshot.modules.includes("trade"), true);
  assert.equal(snapshot.modules.includes("cityStates"), true);
  assert.equal(snapshot.moduleStatus.visibleMap.capturedTurn, snapshot.session.gameTurn);
  assert.equal(snapshot.visibleMap.tileLimit, 1024);
  assert.ok(output.includes('"mode":"full"'));
  assert.ok(output.includes('"trigger":"auto-turn"'));
  assert.equal((output.match(/CIV6_AI_COPILOT_SNAPSHOT_BEGIN/g) ?? []).length, 1);
});

test("automatic turn ignores non-local turns, deduplicates, and cancels delayed work across turns", async () => {
  const output = await runLua(`
local now = os.time()
os.time = function() return now end
local updateCallback
ContextPtr = { SetUpdate = function(_, callback) updateCallback = callback end, ClearUpdate = function() updateCallback = nil end }
localPlayerTurn = 1
Game.GetCurrentPlayer = function() return localPlayerTurn end
api.toggleAutoSync()
assert(api.tryAutoSyncTurn() == false)
assert(plotReads == 0)
localPlayerTurn = 0
assert(api.tryAutoSyncTurn() == true)
turn = turn + 1
now = now + 1
updateCallback()
assert(plotReads == 0 and updateCallback == nil)
assert(api.tryAutoSyncTurn() == true)
now = now + 1
updateCallback()
assert(updateCallback ~= nil)
while updateCallback do updateCallback() end
assert(api.tryAutoSyncTurn() == false)
`);
  assert.equal((output.match(/CIV6_AI_COPILOT_SNAPSHOT_BEGIN/g) ?? []).length, 1);
});

test("manual or active sync protects progress from auto status and busy notices", async () => {
  await runLua(`
local visibleText
Controls = { StatusLabel = { SetText = function(_, value) visibleText = value end } }
api.setSyncProgress("正在汇总")
api.setAutoSyncStatus("等待你的回合开始")
api.setStatus("此时有其他请求正在处理")
assert(visibleText == "正在汇总")
api.clearSyncProgress()
assert(visibleText == "等待你的回合开始")
api.setStatus("汇总完成")
assert(visibleText == "等待你的回合开始")
api.setAutoSyncStatus(nil)
assert(visibleText == "汇总完成")
api.setAutoSyncStatus("本回合战情已更新")
localId = -1
assert(api.startSyncJob("modules", api.withCoreModules({"cities"}), "manual-retry") == false)
assert(visibleText == "LOC_CIV6_AI_COPILOT_STATUS_NO_LOCAL_PLAYER")
`);
});

test("closing auto-update cancels the delayed turn job and leaves no update callback", async () => {
  await runLua(`
local updateCallback
ContextPtr = { SetUpdate = function(_, callback) updateCallback = callback end, ClearUpdate = function() updateCallback = nil end }
api.toggleAutoSync()
assert(api.tryAutoSyncTurn() == true and updateCallback ~= nil)
api.toggleAutoSync()
assert(updateCallback == nil)
api.onCopilotUpdate()
assert(plotReads == 0)
`);
});
