-- Read-only collectors for the first batch of decision data.
-- The UI evidence and remaining in-game checks are documented in docs/first-batch-api-audit.md.

local unpackValues = table.unpack or unpack

local function protectedIndex(value, key)
  if value == nil then
    return false, nil
  end
  local ok, result = pcall(function()
    return value[key]
  end)
  return ok, result
end

local function invoke(target, methodName, ...)
  local indexed, method = protectedIndex(target, methodName)
  if not indexed or type(method) ~= "function" then
    return false
  end
  local arguments = { ... }
  local result = { pcall(function()
    return method(target, unpackValues(arguments))
  end) }
  if not result[1] then
    return false
  end
  table.remove(result, 1)
  return true, unpackValues(result)
end

local function invokeGlobal(target, methodName, ...)
  local indexed, method = protectedIndex(target, methodName)
  if not indexed or type(method) ~= "function" then
    return false
  end
  local arguments = { ... }
  local result = { pcall(function()
    return method(unpackValues(arguments))
  end) }
  if not result[1] then
    return false
  end
  table.remove(result, 1)
  return true, unpackValues(result)
end

local function marked(context, kind, value)
  local indexed, marker = protectedIndex(context, kind)
  if indexed and type(marker) == "function" then
    local ok, result = pcall(marker, value)
    if ok and type(result) == "table" then
      return result
    end
  end
  return value
end

local function array(context, value)
  return marked(context, "jsonArray", value or {})
end

local function object(context, value)
  return marked(context, "jsonObject", value or {})
end

local function lookupText(context, value)
  if type(value) ~= "string" or value == "" then
    return nil
  end

  local indexed, lookup = protectedIndex(context, "lookupText")
  if indexed and type(lookup) == "function" then
    local ok, result = pcall(lookup, value)
    if ok and type(result) == "string" and result ~= "" then
      return result
    end
  end

  local localeOk, locale = protectedIndex(_G, "Locale")
  if localeOk then
    local ok, result = invokeGlobal(locale, "Lookup", value)
    if ok and type(result) == "string" and result ~= "" then
      return result
    end
  end
  return value
end

local function rowsFrom(collection)
  if collection == nil then
    return false, nil
  end
  local ok, result = pcall(function()
    local values = {}
    for row in collection() do
      if row ~= nil then
        values[#values + 1] = row
      end
    end
    return values
  end)
  if not ok or type(result) ~= "table" then
    return false, nil
  end
  return true, result
end

local function memberItems(collection)
  local ok, iterator, state, control = invoke(collection, "Members")
  if not ok or type(iterator) ~= "function" then
    return false, nil
  end
  local iterated, items = pcall(function()
    local result = {}
    for index, item in iterator, state, control do
      if item ~= nil then
        result[#result + 1] = { index = index, item = item }
      end
    end
    return result
  end)
  if not iterated then
    return false, nil
  end
  return true, items
end

local function getGameInfoTable(tableName)
  local gameInfoOk, gameInfo = protectedIndex(_G, "GameInfo")
  if not gameInfoOk or gameInfo == nil then
    return nil
  end
  local tableOk, tableRef = protectedIndex(gameInfo, tableName)
  if tableOk then
    return tableRef
  end
  return nil
end

local function capabilityResult(capability)
  local capabilitiesOk, capabilities = protectedIndex(_G, "GameCapabilities")
  if capabilitiesOk and capabilities ~= nil then
    local ok, result = invokeGlobal(capabilities, "HasCapability", capability)
    if ok and type(result) == "boolean" then
      return true, result
    end
  end

  local hasCapabilityOk, hasCapability = protectedIndex(_G, "HasCapability")
  if hasCapabilityOk and type(hasCapability) == "function" then
    local ok, result = pcall(hasCapability, capability)
    if ok and type(result) == "boolean" then
      return true, result
    end
  end
  return false, nil
end

local function metadata(availability, source, visibility, confidence)
  return {
    availability = availability,
    source = source,
    visibility = visibility,
    confidence = confidence
  }
end

local function isNonnegativeInteger(value)
  return type(value) == "number" and value >= 0 and value % 1 == 0
end

local function unavailable(source, visibility)
  return metadata("unavailable", source, visibility, "low")
end

local function notApplicable(source, visibility)
  return metadata("not-applicable", source, visibility, "confirmed")
end

local function localPlayerFor(localPlayerId)
  if type(localPlayerId) ~= "number" or localPlayerId < 0 then
    return nil
  end
  local playersOk, players = protectedIndex(_G, "Players")
  if not playersOk then
    return nil
  end
  local playerOk, player = protectedIndex(players, localPlayerId)
  if not playerOk then
    return nil
  end
  return player
end

local function readNamedType(context, definition, typeField)
  local typeOk, typeName = protectedIndex(definition, typeField)
  local nameOk, nameKey = protectedIndex(definition, "Name")
  if not typeOk or type(typeName) ~= "string" or typeName == "" or not nameOk then
    return nil, false
  end
  local name = lookupText(context, nameKey)
  if name == nil then
    name = typeName
  end
  return { type = typeName, name = name }, true
end

local function governorCannotAssign(governorType)
  local cannotAssignTable = getGameInfoTable("GovernorsCannotAssign")
  if cannotAssignTable == nil then
    -- GovernorSupport.lua treats a missing table as assignable.
    return false, true
  end
  local ok, rows = rowsFrom(cannotAssignTable)
  if not ok then
    return nil, false
  end
  for _, row in ipairs(rows) do
    local typeOk, rowType = protectedIndex(row, "GovernorType")
    if not typeOk then
      return nil, false
    end
    if rowType == governorType then
      local valueOk, value = protectedIndex(row, "CannotAssign")
      if not valueOk then
        return nil, false
      end
      return value ~= false and value ~= nil, true
    end
  end
  return false, true
end

local function governorPromotionNames(context, governorDefinition, governor)
  local promotionSets = getGameInfoTable("GovernorPromotionSets")
  local promotionDefinitions = getGameInfoTable("GovernorPromotions")
  if promotionSets == nil or promotionDefinitions == nil then
    return nil, false
  end
  local ok, sets = rowsFrom(promotionSets)
  if not ok then
    return nil, false
  end
  local governorTypeOk, governorType = protectedIndex(governorDefinition, "GovernorType")
  if not governorTypeOk then
    return nil, false
  end

  local promotions = {}
  for _, set in ipairs(sets) do
    local setTypeOk, setType = protectedIndex(set, "GovernorType")
    local promotionTypeOk, promotionType = protectedIndex(set, "GovernorPromotion")
    if not setTypeOk or not promotionTypeOk then
      return nil, false
    end
    if setType == governorType then
      local definitionOk, promotionDefinition = protectedIndex(promotionDefinitions, promotionType)
      if not definitionOk or promotionDefinition == nil then
        return nil, false
      end
      local hashOk, hash = protectedIndex(promotionDefinition, "Hash")
      if not hashOk or type(hash) ~= "number" then
        return nil, false
      end
      local hasPromotionOk, hasPromotion = invoke(governor, "HasPromotion", hash)
      if not hasPromotionOk or type(hasPromotion) ~= "boolean" then
        return nil, false
      end
      if hasPromotion then
        local named, namedOk = readNamedType(context, promotionDefinition, "GovernorPromotionType")
        if not namedOk then
          return nil, false
        end
        promotions[#promotions + 1] = named
      end
    end
  end
  return promotions, true
end

local function governorRecord(context, governorDefinition, governor, governorManager, appointed)
  local named, namedOk = readNamedType(context, governorDefinition, "GovernorType")
  if not namedOk then
    return nil, false
  end
  local record = {
    type = named.type,
    name = named.name,
    appointed = appointed
  }
  local titleOk, titleKey = protectedIndex(governorDefinition, "Title")
  if titleOk then
    record.title = lookupText(context, titleKey)
  end

  local hashOk, hash = protectedIndex(governorDefinition, "Hash")
  local totalTurnsOk, totalTurns = false, nil
  if hashOk and type(hash) == "number" then
    totalTurnsOk, totalTurns = invoke(governorManager, "GetTurnsToEstablish", hash)
    if totalTurnsOk and isNonnegativeInteger(totalTurns) then
      record.turnsToEstablish = totalTurns
    else
      totalTurnsOk = false
    end
  end

  local lowConfidence = false
  if appointed then
    local neutralizedOk, neutralizedTurns = invoke(governor, "GetNeutralizedTurns")
    if neutralizedOk and isNonnegativeInteger(neutralizedTurns) then
      record.neutralizedTurns = neutralizedTurns
    else
      neutralizedOk = false
      lowConfidence = true
    end

    local assignedOk, assignedCity = invoke(governor, "GetAssignedCity")
    if assignedOk then
      record.assigned = assignedCity ~= nil
      if assignedCity ~= nil then
        local cityIdOk, cityId = invoke(assignedCity, "GetID")
        local cityNameOk, cityName = invoke(assignedCity, "GetName")
        if cityIdOk and isNonnegativeInteger(cityId) then
          record.assignedCityId = tostring(cityId)
        else
          cityIdOk = false
        end
        if cityNameOk and type(cityName) == "string" then
          record.assignedCityName = lookupText(context, cityName)
        else
          cityNameOk = false
        end

        local establishedOk, established = invoke(governor, "IsEstablished")
        if establishedOk and type(established) == "boolean" then
          record.established = established
        else
          establishedOk = false
        end
        if establishedOk and established == false and totalTurnsOk then
          local turnsOnSiteOk, turnsOnSite = invoke(governor, "GetTurnsOnSite")
          if turnsOnSiteOk and isNonnegativeInteger(turnsOnSite) then
            local turnsRemaining = totalTurns - turnsOnSite
            if isNonnegativeInteger(turnsRemaining) then
              record.turnsUntilEstablished = turnsRemaining
            else
              lowConfidence = true
            end
          else
            turnsOnSiteOk = false
          end
          if not turnsOnSiteOk then
            lowConfidence = true
          end
        end
        if not cityIdOk or not cityNameOk or not establishedOk then
          lowConfidence = true
        end
      end
    else
      lowConfidence = true
    end

    if neutralizedOk and neutralizedTurns > 0 then
      record.status = "neutralized"
    elseif assignedOk and assignedCity == nil then
      record.status = "needs-assignment"
    elseif assignedOk and assignedCity ~= nil and record.established == true then
      record.status = "established"
    elseif assignedOk and assignedCity ~= nil and record.established == false then
      record.status = "transitioning"
    end

    local promotions, promotionsOk = governorPromotionNames(context, governorDefinition, governor)
    if promotionsOk then
      record.promotions = array(context, promotions)
    else
      lowConfidence = true
    end
  else
    record.promotions = array(context, {})
  end

  if not totalTurnsOk then
    lowConfidence = true
  end
  return object(context, record), true, lowConfidence
end

local function collectGovernors(localPlayerId, context)
  local output = metadata("unavailable", "ui-derived", "player-visible", "low")
  local capabilityKnown, hasCapability = capabilityResult("CAPABILITY_GOVERNORS")
  if capabilityKnown and not hasCapability then
    return notApplicable("ui-derived", "player-visible")
  end

  local player = localPlayerFor(localPlayerId)
  if player == nil then
    return output
  end
  local managerOk, governorManager = invoke(player, "GetGovernors")
  if not managerOk or governorManager == nil then
    return output
  end

  local lowConfidence = false
  local pointsOk, points = invoke(governorManager, "GetGovernorPoints")
  local spentOk, spent = invoke(governorManager, "GetGovernorPointsSpent")
  if spentOk and isNonnegativeInteger(spent) then
    output.titlesSpent = spent
  end
  if pointsOk and isNonnegativeInteger(points) and spentOk and isNonnegativeInteger(spent) and points >= spent then
    output.titlesAvailable = points - spent
  else
    lowConfidence = true
    if not spentOk or type(spent) ~= "number" then
      output.titlesSpent = nil
    end
  end

  local canAppointOk, canAppoint = invoke(governorManager, "CanAppoint")
  if canAppointOk and type(canAppoint) == "boolean" then
    output.canAppoint = canAppoint
  else
    lowConfidence = true
  end

  local listOk, hasGovernors, governorList = invoke(governorManager, "GetGovernorList")
  if not listOk or type(governorList) ~= "table" then
    -- A successful false + nil is the only API result that denotes a known empty list.
    if not listOk or hasGovernors ~= false or governorList ~= nil then
      lowConfidence = true
      governorList = nil
    else
      governorList = {}
    end
  elseif type(hasGovernors) ~= "boolean" then
    lowConfidence = true
  end

  local definitionsOk, definitions = rowsFrom(getGameInfoTable("Governors"))
  local definitionsByIndex = {}
  if definitionsOk then
    for _, definition in ipairs(definitions) do
      local indexOk, index = protectedIndex(definition, "Index")
      if not indexOk or type(index) ~= "number" then
        definitionsOk = false
        break
      end
      definitionsByIndex[index] = definition
    end
  end
  if not definitionsOk then
    lowConfidence = true
  end

  local appointedByIndex = {}
  local records = {}
  if governorList ~= nil then
    for _, governor in ipairs(governorList) do
      local typeOk, governorIndex = invoke(governor, "GetType")
      local definition = typeOk and definitionsByIndex[governorIndex] or nil
      if definition == nil then
        lowConfidence = true
      else
        local governorTypeOk, governorType = protectedIndex(definition, "GovernorType")
        local cannotAssign, assignRuleOk
        if governorTypeOk then
          cannotAssign, assignRuleOk = governorCannotAssign(governorType)
        else
          assignRuleOk = false
        end
        if not assignRuleOk then
          lowConfidence = true
        elseif not cannotAssign then
          local record, recordOk, recordLow = governorRecord(context, definition, governor, governorManager, true)
          if recordOk then
            appointedByIndex[governorIndex] = governor
            records[#records + 1] = record
            if recordLow then
              lowConfidence = true
            end
          else
            lowConfidence = true
          end
        end
      end
    end
  end

  if definitionsOk then
    for _, definition in ipairs(definitions) do
      local governorTypeOk, governorType = protectedIndex(definition, "GovernorType")
      local indexOk, governorIndex = protectedIndex(definition, "Index")
      local hashOk, governorHash = protectedIndex(definition, "Hash")
      if not governorTypeOk or type(governorType) ~= "string" or not indexOk or type(governorIndex) ~= "number" or not hashOk or type(governorHash) ~= "number" then
        lowConfidence = true
      else
        local cannotAssign, assignRuleOk = governorCannotAssign(governorType)
        if not assignRuleOk then
          lowConfidence = true
        elseif not cannotAssign and appointedByIndex[governorIndex] == nil then
          local hasGovernorOk, hasGovernor = invoke(governorManager, "HasGovernor", governorHash)
          if hasGovernorOk and type(hasGovernor) == "boolean" then
            if not hasGovernor then
              local canEverOk, canEver = invoke(governorManager, "CanEverAppointGovernor", governorHash)
              if canEverOk and type(canEver) == "boolean" then
                if canEver then
                  local record, recordOk, recordLow = governorRecord(context, definition, nil, governorManager, false)
                  if recordOk then
                    records[#records + 1] = record
                    if recordLow then
                      lowConfidence = true
                    end
                  else
                    lowConfidence = true
                  end
                end
              else
                lowConfidence = true
              end
            end
          else
            lowConfidence = true
          end
        end
      end
    end
  end

  local hasAnyData = output.titlesAvailable ~= nil or output.titlesSpent ~= nil or output.canAppoint ~= nil or governorList ~= nil
  if not hasAnyData then
    return output
  end
  if governorList ~= nil and definitionsOk then
    output.governors = array(context, records)
  elseif governorList ~= nil or definitionsOk then
    lowConfidence = true
  end
  output.availability = "available"
  output.confidence = lowConfidence and "low" or "confirmed"
  return output
end

local function routeRecord(context, localPlayerId, localDiplomacy, originCity, route)
  local record = {}
  local originIdOk, originId = invoke(originCity, "GetID")
  local originNameOk, originName = invoke(originCity, "GetName")
  if originIdOk and isNonnegativeInteger(originId) then
    record.originCityId = tostring(originId)
  end
  if originNameOk and type(originName) == "string" then
    record.originCityName = lookupText(context, originName)
  end

  local playerIdOk, destinationPlayerId = protectedIndex(route, "DestinationCityPlayer")
  local cityIdOk, destinationCityId = protectedIndex(route, "DestinationCityID")
  local canReadDestination = false
  if playerIdOk and isNonnegativeInteger(destinationPlayerId) and cityIdOk and isNonnegativeInteger(destinationCityId) then
    if destinationPlayerId == localPlayerId then
      canReadDestination = true
    else
      local metOk, hasMet = invoke(localDiplomacy, "HasMet", destinationPlayerId)
      canReadDestination = metOk and hasMet == true
    end
  end

  local destinationComplete = true
  if canReadDestination then
    local playersOk, players = protectedIndex(_G, "Players")
    local destPlayerOk, destinationPlayer = false, nil
    if playersOk then
      destPlayerOk, destinationPlayer = protectedIndex(players, destinationPlayerId)
    end
    if destPlayerOk then
      local citiesOk, destinationCities = invoke(destinationPlayer, "GetCities")
      if citiesOk then
        local findOk, destinationCity = invoke(destinationCities, "FindID", destinationCityId)
        if findOk and destinationCity ~= nil then
          local nameOk, destinationName = invoke(destinationCity, "GetName")
          if nameOk and type(destinationName) == "string" then
            record.destinationCityId = tostring(destinationCityId)
            record.destinationCityName = lookupText(context, destinationName)
          else
            destinationComplete = false
          end
        else
          destinationComplete = false
        end
      else
        destinationComplete = false
      end
    else
      destinationComplete = false
    end
  else
    -- Do not disclose the destination owner or city if it is not known to the local player.
    destinationComplete = false
  end

  local routeOk = originIdOk and isNonnegativeInteger(originId) and originNameOk and type(originName) == "string"
  return object(context, record), routeOk and destinationComplete
end

local function collectTrade(localPlayerId, context)
  local output = unavailable("lua-api", "player-visible")
  local capabilityKnown, hasCapability = capabilityResult("CAPABILITY_TRADE")
  if capabilityKnown and not hasCapability then
    return notApplicable("lua-api", "player-visible")
  end
  local player = localPlayerFor(localPlayerId)
  if player == nil then
    return output
  end
  local tradeOk, tradeManager = invoke(player, "GetTrade")
  if not tradeOk or tradeManager == nil then
    return output
  end

  local lowConfidence = false
  local countOk, activeCount = invoke(tradeManager, "GetNumOutgoingRoutes")
  local capacityOk, capacity = invoke(tradeManager, "GetOutgoingRouteCapacity")
  if countOk and isNonnegativeInteger(activeCount) then
    output.activeCount = activeCount
  else
    lowConfidence = true
  end
  if capacityOk and isNonnegativeInteger(capacity) then
    output.capacity = capacity
  else
    lowConfidence = true
  end

  local localDiplomacyOk, localDiplomacy = invoke(player, "GetDiplomacy")
  if not localDiplomacyOk then
    localDiplomacy = nil
  end
  local citiesOk, cities = invoke(player, "GetCities")
  local routes = {}
  local routesComplete = citiesOk and cities ~= nil
  if routesComplete then
    local membersOk, cityEntries = memberItems(cities)
    if not membersOk then
      routesComplete = false
    else
      for _, cityEntry in ipairs(cityEntries) do
        local city = cityEntry.item
        local cityTradeOk, cityTrade = invoke(city, "GetTrade")
        local outgoingOk, outgoingRoutes = invoke(cityTrade, "GetOutgoingRoutes")
        if not cityTradeOk or not outgoingOk or type(outgoingRoutes) ~= "table" then
          routesComplete = false
          break
        end
        local originRoutesOk, routeItems = pcall(function()
          local result = {}
          for _, route in ipairs(outgoingRoutes) do
            if route ~= nil then
              result[#result + 1] = route
            end
          end
          return result
        end)
        if not originRoutesOk then
          routesComplete = false
          break
        end
        for _, route in ipairs(routeItems) do
          local record, complete = routeRecord(context, localPlayerId, localDiplomacy, city, route)
          routes[#routes + 1] = record
          if not complete then
            lowConfidence = true
          end
        end
      end
    end
  end
  if routesComplete then
    output.routes = array(context, routes)
    if output.activeCount ~= nil and output.activeCount ~= #routes then
      lowConfidence = true
    end
  else
    lowConfidence = true
  end

  if output.activeCount == nil and output.capacity == nil and output.routes == nil then
    return output
  end
  output.availability = "available"
  output.confidence = lowConfidence and "low" or "confirmed"
  return output
end

local CITY_STATE_TYPE = {
  LEADER_MINOR_CIV_SCIENTIFIC = "SCIENTIFIC",
  LEADER_MINOR_CIV_RELIGIOUS = "RELIGIOUS",
  LEADER_MINOR_CIV_TRADE = "TRADE",
  LEADER_MINOR_CIV_CULTURAL = "CULTURE",
  LEADER_MINOR_CIV_MILITARISTIC = "MILITARISTIC",
  LEADER_MINOR_CIV_INDUSTRIAL = "INDUSTRIAL"
}

local CITY_STATE_REWARD_PREFIX = {
  SCIENTIFIC = "SCIENTIFIC",
  RELIGIOUS = "RELIGIOUS",
  TRADE = "TRADE",
  CULTURE = "CULTURAL",
  MILITARISTIC = "MILITARISTIC",
  INDUSTRIAL = "INDUSTRIAL"
}

local function cityStateTypeAndRewards(context, playerId)
  local configsOk, configurations = protectedIndex(_G, "PlayerConfigurations")
  if not configsOk then
    return nil, nil, false
  end
  local configOk, configuration = protectedIndex(configurations, playerId)
  if not configOk or configuration == nil then
    return nil, nil, false
  end
  local leaderOk, leaderType = invoke(configuration, "GetLeaderTypeName")
  if not leaderOk or type(leaderType) ~= "string" then
    return nil, nil, false
  end
  local leaderTable = getGameInfoTable("Leaders")
  local leaderInfoOk, leaderInfo = protectedIndex(leaderTable, leaderType)
  if not leaderInfoOk or leaderInfo == nil then
    return nil, nil, false
  end
  local inheritOk, inheritFrom = protectedIndex(leaderInfo, "InheritFrom")
  if not inheritOk then
    return nil, nil, false
  end
  local cityStateType = CITY_STATE_TYPE[leaderType] or CITY_STATE_TYPE[inheritFrom]
  if cityStateType == nil then
    return nil, nil, false
  end

  local prefix = CITY_STATE_REWARD_PREFIX[cityStateType]
  local rewards = {}
  local rewardKeys = {
    oneEnvoy = "LOC_MINOR_CIV_" .. prefix .. "_TRAIT_SMALL_INFLUENCE_BONUS",
    threeEnvoys = "LOC_MINOR_CIV_" .. prefix .. "_TRAIT_MEDIUM_INFLUENCE_BONUS",
    sixEnvoys = "LOC_MINOR_CIV_" .. prefix .. "_TRAIT_LARGE_INFLUENCE_BONUS"
  }
  for key, localizationKey in pairs(rewardKeys) do
    local text = lookupText(context, localizationKey)
    if text ~= nil then
      rewards[key] = text
    end
  end

  local leaderTraits = getGameInfoTable("LeaderTraits")
  local traits = getGameInfoTable("Traits")
  local traitRowsOk, traitRows = rowsFrom(leaderTraits)
  local traitTexts = {}
  local traitScanComplete = traitRowsOk and traits ~= nil
  if traitScanComplete then
    for _, pair in ipairs(traitRows) do
      local rowLeaderOk, rowLeader = protectedIndex(pair, "LeaderType")
      local traitTypeOk, traitType = protectedIndex(pair, "TraitType")
      if not rowLeaderOk or not traitTypeOk then
        traitScanComplete = false
        break
      end
      if rowLeader == leaderType then
        local traitOk, trait = protectedIndex(traits, traitType)
        if not traitOk or trait == nil then
          traitScanComplete = false
          break
        end
        local descriptionOk, descriptionKey = protectedIndex(trait, "Description")
        if not descriptionOk then
          traitScanComplete = false
          break
        end
        if type(descriptionKey) == "string" and descriptionKey ~= "" then
          traitTexts[#traitTexts + 1] = lookupText(context, descriptionKey)
        end
      end
    end
  end
  if traitScanComplete then
    local generic = lookupText(context, "LOC_CITY_STATES_SUZERAIN_DIPLOMATIC_BONUS")
    if generic ~= nil then
      traitTexts[#traitTexts + 1] = generic
    end
    if #traitTexts > 0 then
      rewards.suzerain = table.concat(traitTexts, "\n\n")
    end
  end
  if next(rewards) == nil then
    return cityStateType, nil, false
  end
  return cityStateType, object(context, rewards), traitScanComplete
end

local function readQuestList(context, localPlayerId, cityStateId, questManager)
  local questsTable = getGameInfoTable("Quests")
  local ok, questRows = rowsFrom(questsTable)
  if not ok then
    return nil, false
  end
  local quests = {}
  for _, definition in ipairs(questRows) do
    local indexOk, questIndex = protectedIndex(definition, "Index")
    local typeOk, questType = protectedIndex(definition, "QuestType")
    if not indexOk or questIndex == nil or not typeOk or type(questType) ~= "string" then
      return nil, false
    end
    local activeOk, active = invoke(questManager, "HasActiveQuestFromPlayer", localPlayerId, cityStateId, questIndex)
    if not activeOk or type(active) ~= "boolean" then
      return nil, false
    end
    if active then
      local nameOk, name = invoke(questManager, "GetActiveQuestName", localPlayerId, cityStateId, questIndex)
      local descriptionOk, description = invoke(questManager, "GetActiveQuestDescription", localPlayerId, cityStateId, questIndex)
      local rewardOk, reward = invoke(questManager, "GetActiveQuestReward", localPlayerId, cityStateId, questIndex)
      if not nameOk or type(name) ~= "string" or not descriptionOk or type(description) ~= "string" or not rewardOk or type(reward) ~= "string" then
        return nil, false
      end
      local record = {
        type = questType,
        name = name,
        description = description,
        reward = reward
      }
      quests[#quests + 1] = object(context, record)
    end
  end
  return array(context, quests), true
end

local function collectCityStates(localPlayerId, context)
  local output = unavailable("ui-derived", "player-visible")
  local capabilityKnown, hasCapability = capabilityResult("CAPABILITY_TOP_PANEL_ENVOYS")
  if capabilityKnown and not hasCapability then
    return notApplicable("ui-derived", "player-visible")
  end

  local player = localPlayerFor(localPlayerId)
  if player == nil then
    return output
  end
  local influenceOk, localInfluence = invoke(player, "GetInfluence")
  if not influenceOk or localInfluence == nil then
    return output
  end

  local lowConfidence = false
  local hasUsefulData = false
  local availableEnvoysOk, availableEnvoys = invoke(localInfluence, "GetTokensToGive")
  if availableEnvoysOk and isNonnegativeInteger(availableEnvoys) then
    output.availableEnvoys = availableEnvoys
    hasUsefulData = true
  else
    lowConfidence = true
  end

  local diplomacyOk, localDiplomacy = invoke(player, "GetDiplomacy")
  if not diplomacyOk or localDiplomacy == nil then
    lowConfidence = true
  else
    local playerManagerOk, playerManager = protectedIndex(_G, "PlayerManager")
    local minorsOk, minorPlayers = invokeGlobal(playerManager, "GetAliveMinors")
    if minorsOk and type(minorPlayers) == "table" then
      local cityStatesComplete = true
      local questManagerOk, questManager = invokeGlobal(Game, "GetQuestsManager")
      if not questManagerOk or questManager == nil then
        lowConfidence = true
      end
      local cityStateRecords = {}
      for _, minorPlayer in ipairs(minorPlayers) do
        local idOk, cityStateId = invoke(minorPlayer, "GetID")
        if not idOk or not isNonnegativeInteger(cityStateId) then
          lowConfidence = true
          cityStatesComplete = false
        else
          -- HasMet must succeed before any state configuration or state component is read.
          local metOk, hasMet = invoke(localDiplomacy, "HasMet", cityStateId)
          if not metOk then
            lowConfidence = true
            cityStatesComplete = false
          elseif hasMet == true then
            local stateInfluenceOk, stateInfluence = invoke(minorPlayer, "GetInfluence")
            if not stateInfluenceOk or stateInfluence == nil then
              lowConfidence = true
              cityStatesComplete = false
            else
              local canReceiveOk, canReceive = invoke(stateInfluence, "CanReceiveInfluence")
              if not canReceiveOk or type(canReceive) ~= "boolean" then
                lowConfidence = true
                cityStatesComplete = false
              elseif canReceive then
                local configsOk, configurations = protectedIndex(_G, "PlayerConfigurations")
                local configOk, configuration = false, nil
                if configsOk then
                  configOk, configuration = protectedIndex(configurations, cityStateId)
                end
                if not configOk or configuration == nil then
                  lowConfidence = true
                  cityStatesComplete = false
                else
                  local nameOk, name = invoke(configuration, "GetCivilizationShortDescription")
                  local civTypeOk, civType = invoke(configuration, "GetCivilizationTypeName")
                  local tokensOk, tokens = invoke(stateInfluence, "GetTokensReceived", localPlayerId)
                  local suzerainOk, suzerainId = invoke(stateInfluence, "GetSuzerain")
                  if not nameOk or type(name) ~= "string" or not civTypeOk or type(civType) ~= "string" or not tokensOk or not isNonnegativeInteger(tokens) then
                    lowConfidence = true
                    cityStatesComplete = false
                  else
                    local cityStateType, rewards, rewardsComplete = cityStateTypeAndRewards(context, cityStateId)
                    if not rewardsComplete then
                      lowConfidence = true
                    end
                    local questList
                    local questsComplete = false
                    if questManagerOk and questManager ~= nil then
                      questList, questsComplete = readQuestList(context, localPlayerId, cityStateId, questManager)
                      if not questsComplete then
                        lowConfidence = true
                      end
                    end
                    local record = {
                      playerId = cityStateId,
                      type = cityStateType or civType,
                      name = lookupText(context, name),
                      envoys = tokens
                    }
                    if suzerainOk and type(suzerainId) == "number" and suzerainId >= 0 then
                      record.suzerainPlayerId = suzerainId
                      record.isSuzerain = suzerainId == localPlayerId
                    else
                      lowConfidence = true
                      cityStatesComplete = false
                    end
                    if rewards ~= nil then
                      record.rewards = rewards
                    end
                    if questsComplete then
                      record.quests = questList
                    end
                    if suzerainOk and type(suzerainId) == "number" then
                      cityStateRecords[#cityStateRecords + 1] = object(context, record)
                      hasUsefulData = true
                    end
                  end
                end
              end
            end
          end
        end
      end
      if cityStatesComplete then
        output.cityStates = array(context, cityStateRecords)
        hasUsefulData = true
      end
    else
      lowConfidence = true
    end
  end

  if not hasUsefulData then
    return output
  end
  output.availability = "available"
  output.confidence = lowConfidence and "low" or "confirmed"
  return output
end

Civ6CopilotDecisionData = {
  collectGovernors = collectGovernors,
  collectTrade = collectTrade,
  collectCityStates = collectCityStates
}

return Civ6CopilotDecisionData
