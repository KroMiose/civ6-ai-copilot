-- Synthetic UI API doubles. No Firaxis code or game database is embedded.
turn, localId, currentPlayerId = 42, 0, 0
Game = {
  GetLocalPlayer = function() return localId end,
  GetCurrentPlayer = function() return currentPlayerId end,
  GetCurrentGameTurn = function() return turn end
}
GameConfiguration = {
  GetValue = function() return "RULESET_TEST" end,
  GetGameSpeedType = function() return "GAMESPEED_TEST" end,
  GetMapSize = function() return "MAPSIZE_TEST" end,
  IsAnyMultiplayer = function() return true end
}
Locale = { Lookup = function(value, ...) return value end }
statusText = nil
Controls = { StatusLabel = { SetText = function(_, value) statusText = value end } }
ExposedMembers, Mouse = {}, { eLClick = 1 }
local function rows(data, onRead)
  local result = {}
  for _, row in ipairs(data) do
    result[row.Index] = row
    if row.Hash then result[row.Hash] = row end
  end
  return setmetatable(result, { __call = function()
    if onRead then onRead() end
    local index = 0
    return function() index = index + 1; return data[index] end
  end })
end
yieldEnumerations, resourceHandles, plotReads, resourceCountReads = 0, 0, 0, 0
forbiddenPlotReads = 0
local yieldRows = {}
for index, name in ipairs({"FOOD", "PRODUCTION", "GOLD", "SCIENCE", "CULTURE", "FAITH"}) do
  table.insert(yieldRows, { Index = index - 1, YieldType = "YIELD_" .. name })
end
GameInfo = {
  Yields = rows(yieldRows, function() yieldEnumerations = yieldEnumerations + 1 end),
  Units = rows({{Index = 0, Hash = -10, UnitType = "UNIT_TEST", Name = "Test unit"}}),
  Buildings = rows({
    {Index = 0, Hash = 50, BuildingType = "BUILDING_TEST", Name = "Test building"},
    {Index = 1, Hash = 51, BuildingType = "BUILDING_TEST_TWO", Name = "Second test building"}
  }),
  Districts = rows({{Index = 0, Hash = 60, DistrictType = "DISTRICT_TEST", Name = "Test district"}}),
  UnitPromotions = rows({{Index = 0, UnitPromotionType = "PROMOTION_TEST", Name = "Test promotion"}}),
  Terrains = rows({{Index = 0, TerrainType = "TERRAIN_TEST"}}),
  Resources = rows({{Index = 0, Hash = 90, ResourceType = "RESOURCE_TEST", Name = "Test resource"}}),
  Technologies = rows({{Index = 0, TechnologyType = "TECH_TEST", Name = "Test tech"}}),
  Civics = rows({{Index = 0, CivicType = "CIVIC_TEST", Name = "Test civic"}}),
  Governments = rows({{Index = 0, GovernmentType = "GOVERNMENT_TEST"}}),
  Policies = rows({
    {Index = 0, Hash = 10, PolicyType = "POLICY_TEST", GovernmentSlotType = "SLOT_ECONOMIC", Name = "Test policy", Description = "Visible effect"},
    {Index = 1, Hash = 11, PolicyType = "POLICY_OBSOLETE"},
    {Index = 2, Hash = 12, PolicyType = "POLICY_LOCKED"}
  })
}
function members(values) return { Members = function() return ipairs(values) end } end
function makeUnit(id, owner, x, visible)
  return {
    GetID = function() return id end, GetOwner = function() return owner end,
    GetX = function() return x end, GetY = function() return 1 end,
    GetType = function() return 0 end, GetName = function() return "Test unit" end,
    GetDamage = function() return 25 end, GetMovesRemaining = function() return 2 end,
    GetCombat = function() return 20 end, GetRangedCombat = function() return 30 end,
    GetBombardCombat = function() return 0 end,
    GetRange = function() if owner ~= localId then foreignUnitFieldReads = foreignUnitFieldReads + 1 end; return 2 end,
    GetMaxMoves = function() if owner ~= localId then foreignUnitFieldReads = foreignUnitFieldReads + 1 end; return 3 end,
    GetBuildCharges = function() if owner ~= localId then foreignUnitFieldReads = foreignUnitFieldReads + 1 end; return 4 end,
    GetMilitaryFormation = function() if owner ~= localId then foreignUnitFieldReads = foreignUnitFieldReads + 1 end; return 0 end,
    GetUpgradeCost = function() if owner ~= localId then foreignUnitFieldReads = foreignUnitFieldReads + 1 end; return 75 end,
    GetExperience = function()
      if owner ~= localId then foreignUnitFieldReads = foreignUnitFieldReads + 1 end
      return {
        GetExperiencePoints = function() return 15 end,
        GetExperienceForNextLevel = function() return 30 end,
        GetLevel = function() return 2 end,
        GetPromotions = function() return {0} end
      }
    end,
    visible = visible
  }
end
foreignUnitFieldReads = 0
ownUnit = makeUnit(1, 0, 128, true)
foreignUnit = makeUnit(2, 1, 129, true)
hiddenUnit = makeUnit(3, 1, 129, false)
productionHash, growthTurns, starvationTurns = -10, 4, -1
MilitaryFormationTypes = { STANDARD_FORMATION = 0, CORPS_FORMATION = 1, ARMY_FORMATION = 2 }
local district = { GetType = function() return 0 end }
local cityDistricts = {
  Members = function() return ipairs({district}) end,
  HasDistrict = function(_, index, includeUnderConstruction) return index == 0 and includeUnderConstruction == true end,
  GetNumZonedDistrictsRequiringPopulation = function() return 1 end,
  GetNumAllowedDistrictsRequiringPopulation = function() return 2 end
}
buildingQueryFails = false
local cityBuildings = { HasBuilding = function(_, index)
  if buildingQueryFails and index == 1 then error("building query failed") end
  return index == 0
end }
local siegeDistrict = { IsUnderSiege = function() return true end }
city = {
  GetID = function() return 1 end, GetOwner = function() return 0 end, GetName = function() return "Test city" end,
  GetX = function() return 128 end, GetY = function() return 1 end,
  GetPopulation = function() return 5 end, GetYield = function(_, index) return index + 2 end,
  GetDistrictID = function() return 7 end,
  GetDistricts = function() return cityDistricts end,
  GetBuildings = function() return cityBuildings end,
  GetBuildQueue = function() return {
    GetCurrentProductionTypeHash = function() return productionHash end,
    GetTurnsLeft = function() return 1 end,
    GetUnitProgress = function() return 12 end,
    GetUnitCost = function() return 40 end,
    GetCurrentProductionTypeModifier = function() return MilitaryFormationTypes.STANDARD_FORMATION end
  } end,
  GetGrowth = function() return {
    GetHousing = function() return 6 end, GetAmenities = function() return 1 end,
    GetAmenitiesNeeded = function() return 2 end, GetTurnsUntilGrowth = function() return growthTurns end,
    GetTurnsUntilStarvation = function() return starvationTurns end,
    GetFood = function() return 20 end, GetFoodSurplus = function() return 4 end,
    GetGrowthThreshold = function() return 50 end
  } end
}
selectedCity, selectedUnit = nil, nil
UI = {
  GetHeadSelectedCity = function() return selectedCity end,
  GetHeadSelectedUnit = function() return selectedUnit end
}
resourceVisible = false
playerResources = { IsResourceVisible = function() return resourceVisible end, GetResourceAmount = function() return 3 end }
techs = {
  GetResearchingTech = function() return 0 end, HasTech = function() return false end,
  CanResearch = function() return true end, HasBoostBeenTriggered = function() return true end,
  GetResearchProgress = function() return 10 end, GetResearchCost = function() return 50 end,
  GetScienceYield = function() return 12 end
}
culture = {
  GetProgressingCivic = function() return 0 end, HasCivic = function() return false end,
  CanProgress = function() return true end, HasBoostBeenTriggered = function() return false end,
  GetCulturalProgress = function() return 5 end, GetCultureCost = function() return 40 end,
  GetCultureYield = function() return 6 end, GetCurrentGovernment = function() return 0 end,
  GetNumPolicySlots = function() return 0 end, IsPolicyActive = function() return false end,
  IsPolicyUnlocked = function(_, hash) return hash ~= 12 end,
  IsPolicyObsolete = function(_, hash) return hash == 11 end
}
treasury = { GetGoldBalance = function() return 100 end, GetGoldYield = function() return 15 end, GetTotalMaintenance = function() return 4 end }
player = {
  IsHuman = function() return true end, GetCities = function() return members({city}) end,
  GetUnits = function() return members({ownUnit}) end,
  GetResources = function() resourceHandles = resourceHandles + 1; return playerResources end,
  GetTechs = function() return techs end, GetCulture = function() return culture end,
  GetTreasury = function() return treasury end,
  GetDistricts = function() return { FindID = function(_, id) if id == 7 then return siegeDistrict end end } end,
  GetReligion = function() return { GetFaithBalance = function() return 20 end, GetFaithYield = function() return 2 end } end
}
Players = { [0] = player }
PlayerConfigurations = { [0] = {
  GetCivilizationTypeName = function() return "CIVILIZATION_TEST" end,
  GetLeaderTypeName = function() return "LEADER_TEST" end
} }
visibility = {
  IsRevealed = function(_, x, y) return not (x == 0 and y == 0) end,
  IsVisible = function(_, x, y) return x >= 126 and y <= 2 end,
  IsUnitVisible = function(_, unit) return unit.visible end
}
PlayersVisibility = { [0] = visibility }
Civ6CopilotDecisionData = {
  collectGovernors = function(_, context)
    return { availability = "unavailable", source = "inferred", visibility = "player-visible", confidence = "low" }
  end,
  collectTrade = function(_, context)
    return { availability = "unavailable", source = "inferred", visibility = "player-visible", confidence = "low" }
  end,
  collectCityStates = function(_, context)
    return { availability = "unavailable", source = "inferred", visibility = "player-visible", confidence = "low" }
  end
}
Map = {
  GetGridSize = function() return 130, 80 end,
  GetPlot = function(x, y)
    if not visibility:IsVisible(x, y) then forbiddenPlotReads = forbiddenPlotReads + 1 end
    assert(visibility:IsVisible(x, y), "Plot must NEVER be read through fog")
    plotReads = plotReads + 1
    return {
      x = x, y = y, GetX = function() return x end, GetY = function() return y end,
      GetOwner = function() return 1 end, GetTerrainType = function() return 0 end,
      GetResourceType = function() return 0 end,
      GetResourceCount = function() resourceCountReads = resourceCountReads + 1; return 7 end,
      GetYield = function(_, index) return index == 0 and 2 or 0 end
    }
  end
}
Units = { GetUnitsInPlot = function(plot)
  if plot.x == 129 and plot.y == 1 then return {foreignUnit, hiddenUnit} end
  return {}
end }
