-- Synthetic Civilization VI UI/API doubles for the first-batch read-only collectors.
-- This fixture contains no Firaxis source, database exports, or player capture data.

arrayTags = setmetatable({}, { __mode = "k" })
objectTags = setmetatable({}, { __mode = "k" })
function jsonArray(value)
  arrayTags[value] = true
  return value
end
function jsonObject(value)
  objectTags[value] = true
  return value
end
function lookupText(value) return value end
decisionContext = { jsonArray = jsonArray, jsonObject = jsonObject, lookupText = lookupText }

local function gameInfoRows(data)
  local result = {}
  for _, row in ipairs(data) do
    if row.Index ~= nil then result[row.Index] = row end
    if row.Hash ~= nil then result[row.Hash] = row end
    if row.GovernorPromotionType ~= nil then result[row.GovernorPromotionType] = row end
    if row.GovernorPromotion ~= nil then result[row.GovernorPromotion] = row end
    if row.LeaderType ~= nil then result[row.LeaderType] = row end
    if row.TraitType ~= nil then result[row.TraitType] = row end
  end
  return setmetatable(result, {
    __call = function()
      local index = 0
      return function()
        index = index + 1
        return data[index]
      end
    end
  })
end

GameInfo = {
  Governors = gameInfoRows({
    { Index = 1, Hash = 101, GovernorType = "GOVERNOR_TEST", Name = "LOC_GOVERNOR_TEST", Title = "LOC_GOVERNOR_TEST_TITLE" },
    { Index = 2, Hash = 102, GovernorType = "GOVERNOR_CANDIDATE", Name = "LOC_GOVERNOR_CANDIDATE", Title = "LOC_GOVERNOR_CANDIDATE_TITLE" },
    { Index = 3, Hash = 103, GovernorType = "GOVERNOR_HIDDEN", Name = "LOC_GOVERNOR_HIDDEN", Title = "LOC_GOVERNOR_HIDDEN_TITLE" }
  }),
  GovernorsCannotAssign = gameInfoRows({
    { Index = 1, GovernorType = "GOVERNOR_HIDDEN", CannotAssign = true }
  }),
  GovernorPromotionSets = gameInfoRows({
    { Index = 1, GovernorType = "GOVERNOR_TEST", GovernorPromotion = "GOVERNOR_PROMOTION_TEST" },
    { Index = 2, GovernorType = "GOVERNOR_TEST", GovernorPromotion = "GOVERNOR_PROMOTION_LOCKED" }
  }),
  GovernorPromotions = gameInfoRows({
    { Index = 1, Hash = 501, GovernorPromotionType = "GOVERNOR_PROMOTION_TEST", Name = "LOC_GOVERNOR_PROMOTION_TEST" },
    { Index = 2, Hash = 502, GovernorPromotionType = "GOVERNOR_PROMOTION_LOCKED", Name = "LOC_GOVERNOR_PROMOTION_LOCKED" }
  }),
  Leaders = gameInfoRows({
    { Index = 1, LeaderType = "LEADER_MINOR_CIV_SCIENTIFIC", InheritFrom = "LEADER_MINOR_CIV_SCIENTIFIC" }
  }),
  LeaderTraits = gameInfoRows({
    { Index = 1, LeaderType = "LEADER_MINOR_CIV_SCIENTIFIC", TraitType = "TRAIT_CITY_STATE_TEST" }
  }),
  Traits = gameInfoRows({
    { Index = 1, TraitType = "TRAIT_CITY_STATE_TEST", Name = "LOC_TRAIT_CITY_STATE_TEST", Description = "LOC_TRAIT_CITY_STATE_TEST_DESCRIPTION" }
  }),
  Quests = gameInfoRows({
    { Index = 1, QuestType = "QUEST_TEST" },
    { Index = 2, QuestType = "QUEST_INACTIVE" }
  })
}

GameCapabilities = {
  HasCapability = function(capability)
    return capability == "CAPABILITY_GOVERNORS"
      or capability == "CAPABILITY_TRADE"
      or capability == "CAPABILITY_TOP_PANEL_ENVOYS"
  end
}

local localCity = { GetID = function() return 10 end, GetName = function() return "LOC_LOCAL_CITY" end }
local destinationCity = { GetID = function() return 11 end, GetName = function() return "LOC_DESTINATION_CITY" end }
local route = { DestinationCityPlayer = 0, DestinationCityID = 11 }
local outgoingRoutes = { route }
local cityTrade = { GetOutgoingRoutes = function() return outgoingRoutes end }
localCity.GetTrade = function() return cityTrade end
local function cityCollection(cities)
  return {
    Members = function()
      local index = 0
      return function()
        index = index + 1
        local city = cities[index]
        if city == nil then return nil end
        return index, city
      end
    end,
    FindID = function(_, id)
      if id == destinationCity.GetID() then return destinationCity end
      if id == localCity.GetID() then return localCity end
      return nil
    end
  }
end

local appointedGovernor = {
  GetType = function() return 1 end,
  GetNeutralizedTurns = function() return 0 end,
  GetAssignedCity = function() return localCity end,
  IsEstablished = function() return false end,
  GetTurnsOnSite = function() return 2 end,
  HasPromotion = function(_, hash) return hash == 501 end
}
local governorManager = {
  GetGovernorPoints = function() return 0 end,
  GetGovernorPointsSpent = function() return 0 end,
  CanAppoint = function() return false end,
  GetGovernorList = function() return true, { appointedGovernor } end,
  HasGovernor = function(_, hash) return hash == 101 end,
  CanEverAppointGovernor = function(_, hash) return hash == 102 or hash == 103 end,
  GetTurnsToEstablish = function(_, hash)
    if hash == 101 then return 5 end
    return 3
  end
}

unknownCityStateReads = 0
local knownCityStateInfluence = {
  CanReceiveInfluence = function() return true end,
  GetTokensReceived = function(_, recipientId)
    assert(recipientId == 0, "only read the local player's envoy count")
    return 2
  end,
  GetSuzerain = function() return 99 end
}
local knownCityState = {
  GetID = function() return 5 end,
  GetInfluence = function() return knownCityStateInfluence end
}
local unknownCityState = {
  GetID = function() return 8 end,
  GetInfluence = function()
    unknownCityStateReads = unknownCityStateReads + 1
    error("unmet city-state details must not be read")
  end
}

local questManager = {
  HasActiveQuestFromPlayer = function(_, localPlayerId, cityStateId, questIndex)
    assert(localPlayerId == 0 and cityStateId == 5)
    return questIndex == 1
  end,
  GetActiveQuestName = function() return "LOC_QUEST_TEST_NAME" end,
  GetActiveQuestDescription = function() return "LOC_QUEST_TEST_DESCRIPTION" end,
  GetActiveQuestReward = function() return "LOC_QUEST_TEST_REWARD" end
}

local diplomacy = {
  HasMet = function(_, playerId) return playerId == 5 or playerId == 0 end
}
local localInfluence = { GetTokensToGive = function() return 0 end }
local tradeManager = {
  GetNumOutgoingRoutes = function() return 1 end,
  GetOutgoingRouteCapacity = function() return 2 end
}

local player = {
  GetGovernors = function() return governorManager end,
  GetTrade = function() return tradeManager end,
  GetInfluence = function() return localInfluence end,
  GetDiplomacy = function() return diplomacy end,
  GetCities = function() return cityCollection({ localCity }) end
}
privateDestinationReads = 0
local destinationPlayer = {
  GetCities = function()
    privateDestinationReads = privateDestinationReads + 1
    return cityCollection({ destinationCity })
  end
}
Players = { [0] = player, [1] = destinationPlayer }
PlayerConfigurations = {
  [0] = {
    GetCivilizationShortDescription = function() return "LOC_LOCAL_CIV" end,
    GetCivilizationTypeName = function() return "CIVILIZATION_LOCAL" end,
    GetLeaderTypeName = function() return "LEADER_LOCAL" end
  },
  [5] = {
    GetCivilizationShortDescription = function() return "LOC_KNOWN_CITY_STATE" end,
    GetCivilizationTypeName = function() return "CIVILIZATION_MINOR_TEST" end,
    GetLeaderTypeName = function() return "LEADER_MINOR_CIV_SCIENTIFIC" end
  },
  [8] = {
    GetCivilizationShortDescription = function() error("unmet city-state configuration must not be read") end
  }
}
PlayerManager = { GetAliveMinors = function() return { knownCityState, unknownCityState } end }
Game = { GetQuestsManager = function() return questManager end }

function resetDecisionDataMocks()
  unknownCityStateReads = 0
  privateDestinationReads = 0
  outgoingRoutes = { route }
  tradeManager.GetNumOutgoingRoutes = function() return 1 end
  tradeManager.GetOutgoingRouteCapacity = function() return 2 end
  cityTrade.GetOutgoingRoutes = function() return outgoingRoutes end
  diplomacy.HasMet = function(_, playerId) return playerId == 5 or playerId == 0 end
  localInfluence.GetTokensToGive = function() return 0 end
  player.GetGovernors = function() return governorManager end
  player.GetTrade = function() return tradeManager end
  player.GetInfluence = function() return localInfluence end
  player.GetDiplomacy = function() return diplomacy end
  player.GetCities = function() return cityCollection({ localCity }) end
end
