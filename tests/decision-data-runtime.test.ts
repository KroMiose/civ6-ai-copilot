import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateSnapshotObject } from "../tools/snapshot/src/validate.js";

const helperPath = "mod/ui/civ6_ai_copilot_decision_data.lua";
const fixturePath = "tests/fixtures/decision-data-mocks.lua";

async function runLua(body: string): Promise<string> {
  const [helper, mocks] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(fixturePath, "utf8")
  ]);
  const dir = await mkdtemp(path.join(os.tmpdir(), "civ6-decision-data-lua-"));
  try {
    const script = path.join(dir, "decision-data.lua");
    await writeFile(script, `${mocks}\nlocal function loadDecisionData()\n${helper}\nend\nlocal api = loadDecisionData()\n${body}\nprint("LUA_TEST_OK")\n`, "utf8");
    const output = execFileSync(
      process.execPath,
      ["node_modules/fengari-node-cli/src/lua-cli.js", script],
      { encoding: "utf8", timeout: 30000 }
    );
    // Fengari may exit 0 after a Lua assertion error; require the explicit end marker.
    assert.match(output, /LUA_TEST_OK/);
    return output;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const jsonHelpers = String.raw`
local function jsonEscape(value)
  return tostring(value):gsub("\\", "\\\\"):gsub('"', '\\"')
    :gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
end
local function jsonEncode(value)
  local valueType = type(value)
  if valueType == "nil" then return "null" end
  if valueType == "boolean" then return value and "true" or "false" end
  if valueType == "number" then return tostring(value) end
  if valueType == "string" then return '"' .. jsonEscape(value) .. '"' end
  if valueType ~= "table" then return "null" end
  local parts = {}
  if arrayTags[value] then
    for index, item in ipairs(value) do parts[index] = jsonEncode(item) end
    return "[" .. table.concat(parts, ",") .. "]"
  end
  local keys = {}
  for key in pairs(value) do keys[#keys + 1] = key end
  table.sort(keys)
  for index, key in ipairs(keys) do
    parts[index] = '"' .. jsonEscape(key) .. '":' .. jsonEncode(value[key])
  end
  return "{" .. table.concat(parts, ",") .. "}"
end
`;

test("decision-data collectors export player-visible facts and preserve unknowns", async () => {
  const output = await runLua(`
local governors = api.collectGovernors(0, decisionContext)
assert(governors.availability == "available" and governors.confidence == "confirmed")
assert(governors.source == "ui-derived" and governors.visibility == "player-visible")
assert(governors.titlesAvailable == 0 and governors.titlesSpent == 0 and governors.canAppoint == false)
assert(arrayTags[governors.governors] and #governors.governors == 2)
local appointed, candidate = governors.governors[1], governors.governors[2]
assert(appointed.type == "GOVERNOR_TEST" and appointed.appointed == true)
assert(appointed.assigned == true and appointed.assignedCityId == "10" and appointed.assignedCityName == "LOC_LOCAL_CITY")
assert(appointed.established == false and appointed.status == "transitioning")
assert(appointed.turnsToEstablish == 5 and appointed.turnsUntilEstablished == 3)
assert(arrayTags[appointed.promotions] and #appointed.promotions == 1)
assert(appointed.promotions[1].type == "GOVERNOR_PROMOTION_TEST")
assert(candidate.type == "GOVERNOR_CANDIDATE" and candidate.appointed == false)
for _, governor in ipairs(governors.governors) do assert(governor.type ~= "GOVERNOR_HIDDEN") end

local trade = api.collectTrade(0, decisionContext)
assert(trade.availability == "available" and trade.confidence == "confirmed")
assert(trade.source == "lua-api" and trade.visibility == "player-visible")
assert(trade.activeCount == 1 and trade.capacity == 2 and #trade.routes == 1)
local visibleRoute = trade.routes[1]
assert(visibleRoute.originCityId == "10" and visibleRoute.originCityName == "LOC_LOCAL_CITY")
assert(visibleRoute.destinationCityId == "11" and visibleRoute.destinationCityName == "LOC_DESTINATION_CITY")
assert(visibleRoute.turnsRemaining == nil)
for key in pairs(visibleRoute) do assert(key ~= "x" and key ~= "y" and key ~= "destinationPlayerId") end
outgoingRoutes[1].DestinationCityPlayer = 1
privateDestinationReads = 0
local hiddenDestinationTrade = api.collectTrade(0, decisionContext)
assert(hiddenDestinationTrade.confidence == "low" and #hiddenDestinationTrade.routes == 1,
  "unmet route destination result: " .. tostring(hiddenDestinationTrade.confidence) .. ", routes=" .. tostring(#hiddenDestinationTrade.routes))
assert(hiddenDestinationTrade.routes[1].destinationCityId == nil, "unmet destination ID must not be exported")
assert(hiddenDestinationTrade.routes[1].destinationCityName == nil, "unmet destination name must not be exported")
assert(privateDestinationReads == 0, "unmet destination details must not be read")
outgoingRoutes[1].DestinationCityPlayer = 0

local cityStates = api.collectCityStates(0, decisionContext)
assert(cityStates.availability == "available" and cityStates.confidence == "confirmed")
assert(cityStates.source == "ui-derived" and cityStates.visibility == "player-visible")
assert(cityStates.availableEnvoys == 0 and arrayTags[cityStates.cityStates] and #cityStates.cityStates == 1)
local known = cityStates.cityStates[1]
assert(known.playerId == 5 and known.type == "SCIENTIFIC" and known.envoys == 2)
assert(known.isSuzerain == false and known.suzerainId == nil)
assert(known.rewards.oneEnvoy == "LOC_MINOR_CIV_SCIENTIFIC_TRAIT_SMALL_INFLUENCE_BONUS")
assert(known.rewards.suzerain:find("LOC_TRAIT_CITY_STATE_TEST_DESCRIPTION", 1, true))
assert(arrayTags[known.quests] and #known.quests == 1)
assert(known.quests[1].type == "QUEST_TEST" and known.quests[1].reward == "LOC_QUEST_TEST_REWARD")
assert(unknownCityStateReads == 0)
for key in pairs(known) do assert(key ~= "suzerainId" and key ~= "suzerainPlayerId") end
${jsonHelpers}
print("DECISION_DATA " .. jsonEncode({ governors = governors, trade = trade, cityStates = cityStates }))
`);
  const line = output.split(/\r?\n/).find((item) => item.startsWith("DECISION_DATA "));
  assert.ok(line, "expected serialized collector output");
  const data = JSON.parse(line.slice("DECISION_DATA ".length)) as Record<string, any>;

  const snapshot = JSON.parse(await readFile("tests/fixtures/minimal-player-visible.snapshot.json", "utf8")) as Record<string, any>;
  snapshot.selection = {
    source: "lua-api",
    visibility: "own",
    confidence: "confirmed",
    city: { status: "none", id: null },
    unit: { status: "none", id: null }
  };
  if (!snapshot.modules.includes("selection")) snapshot.modules.push("selection");
  snapshot.moduleStatus.selection = {
    capturedTurn: snapshot.session.gameTurn,
    capturedAt: snapshot.exportedAt,
    exportId: snapshot.source.exportId
  };
  snapshot.confidence.selection = "confirmed";
  snapshot.governors = data.governors;
  snapshot.trade = data.trade;
  snapshot.cityStates = data.cityStates;
  for (const moduleName of ["governors", "trade", "cityStates"]) {
    if (!snapshot.modules.includes(moduleName)) snapshot.modules.push(moduleName);
    snapshot.moduleStatus[moduleName] = {
      capturedTurn: snapshot.session.gameTurn,
      capturedAt: snapshot.exportedAt,
      exportId: snapshot.source.exportId
    };
    snapshot.confidence[moduleName] = data[moduleName].confidence;
  }
  const validation = await validateSnapshotObject(snapshot);
  assert.equal(validation.ok, true, JSON.stringify(validation, null, 2));
});

test("decision-data collectors distinguish zero from unavailable and not-applicable", async () => {
  await runLua(`
tradeManager.GetNumOutgoingRoutes = function() return 0 end
tradeManager.GetOutgoingRouteCapacity = function() return 0 end
outgoingRoutes = {}
local zeroTrade = api.collectTrade(0, decisionContext)
assert(zeroTrade.availability == "available" and zeroTrade.confidence == "confirmed")
assert(zeroTrade.activeCount == 0 and zeroTrade.capacity == 0)
assert(arrayTags[zeroTrade.routes] and #zeroTrade.routes == 0)

cityTrade.GetOutgoingRoutes = nil
local incompleteTrade = api.collectTrade(0, decisionContext)
assert(incompleteTrade.availability == "available" and incompleteTrade.confidence == "low")
assert(incompleteTrade.activeCount == 0 and incompleteTrade.capacity == 0)
assert(incompleteTrade.routes == nil, "failed route enumeration must not become an empty array")
cityTrade.GetOutgoingRoutes = function() return outgoingRoutes end

player.GetGovernors = nil
local missingGovernors = api.collectGovernors(0, decisionContext)
assert(missingGovernors.availability == "unavailable" and missingGovernors.confidence == "low")
assert(missingGovernors.governors == nil and missingGovernors.titlesAvailable == nil)
player.GetGovernors = function() return governorManager end

player.GetTrade = nil
local missingTrade = api.collectTrade(0, decisionContext)
assert(missingTrade.availability == "unavailable" and missingTrade.capacity == nil and missingTrade.routes == nil)
player.GetTrade = function() return tradeManager end

player.GetInfluence = nil
local missingCityStates = api.collectCityStates(0, decisionContext)
assert(missingCityStates.availability == "unavailable")
assert(missingCityStates.availableEnvoys == nil and missingCityStates.cityStates == nil)
player.GetInfluence = function() return localInfluence end

GameCapabilities.HasCapability = function(capability)
  return capability ~= "CAPABILITY_TRADE"
end
local tradeNotApplicable = api.collectTrade(0, decisionContext)
assert(tradeNotApplicable.availability == "not-applicable")
assert(tradeNotApplicable.capacity == nil and tradeNotApplicable.routes == nil)
GameCapabilities.HasCapability = function(capability) return true end

governorManager.GetTurnsToEstablish = function(_, hash)
  if hash == 101 then return -1 end
  return 3
end
local negativeTurnSentinel = api.collectGovernors(0, decisionContext)
assert(negativeTurnSentinel.availability == "available" and negativeTurnSentinel.confidence == "low")
assert(negativeTurnSentinel.governors[1].turnsToEstablish == nil)
assert(negativeTurnSentinel.governors[1].turnsUntilEstablished == nil)
governorManager.GetTurnsToEstablish = function(_, hash)
  if hash == 101 then return 5 end
  return 3
end
appointedGovernor.GetTurnsOnSite = function() return -1 end
local negativeOnSiteSentinel = api.collectGovernors(0, decisionContext)
assert(negativeOnSiteSentinel.confidence == "low")
assert(negativeOnSiteSentinel.governors[1].turnsUntilEstablished == nil)
appointedGovernor.GetTurnsOnSite = function() return 2 end

resetDecisionDataMocks()
diplomacy.HasMet = function(_, playerId)
  if playerId == 8 then error("met-state check failed") end
  return playerId == 5
end
local metCheckFailure = api.collectCityStates(0, decisionContext)
assert(metCheckFailure.availability == "available" and metCheckFailure.confidence == "low")
assert(metCheckFailure.availableEnvoys == 0)
assert(metCheckFailure.cityStates == nil, "incomplete met-state filtering must not serialize a partial/empty list")
assert(unknownCityStateReads == 0)
`);
});
