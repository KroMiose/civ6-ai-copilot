-- civ6-ai-copilot passive UI exporter.
-- This file must stay read-only with respect to gameplay state. It only reads UI-visible data and exports chunks.

local MOD_ID = "civ6-ai-copilot"
local MOD_VERSION = "0.3.1"
local COMPAT_VERSION = "0.3"
local SCHEMA_VERSION = "0.3.0"
local PROTOCOL_VERSION = "0.3.0"
local CHUNK_SIZE = 700

local SNAPSHOT_BEGIN = "CIV6_AI_COPILOT_SNAPSHOT_BEGIN"
local SNAPSHOT_CHUNK = "CIV6_AI_COPILOT_SNAPSHOT_CHUNK"
local SNAPSHOT_END = "CIV6_AI_COPILOT_SNAPSHOT_END"
local COPILOT_DIAGNOSTIC = "CIV6_AI_COPILOT_DIAGNOSTIC"
local COPILOT_ICON_CANDIDATES = { "ICON_CIVILOPEDIA_CONCEPTS" }
local COPILOT_ICON_SIZE = 32
local ICON_PREVIEW_CANDIDATE_GROUPS = {
  {
    control = "IconPreviewLaunchBarRow",
    candidates = {
      { label = "报告", texture = "LaunchBar_Hook_Reports", tooltip = "LaunchBar_Hook_Reports\n接近战情简报、情报报告或总览入口。" },
      { label = "著作", texture = "LaunchBar_Hook_GreatWorks", tooltip = "LaunchBar_Hook_GreatWorks\n书册轮廓清晰，但文化意味更强。" },
      { label = "伟人", texture = "LaunchBar_Hook_GreatPeople", tooltip = "LaunchBar_Hook_GreatPeople\n人物感强，但可能与伟人入口混淆。" },
      { label = "商路", texture = "LaunchBar_Hook_Trade", tooltip = "LaunchBar_Hook_Trade\n偏战略流动与交易情报。" },
      { label = "排名", texture = "LaunchBar_Hook_WorldRankings", tooltip = "LaunchBar_Hook_WorldRankings\n适合全局比较，但竞技意味更强。" },
      { label = "城邦", texture = "LaunchBar_Hook_CityStates", tooltip = "LaunchBar_Hook_CityStates\n外交语义明确，但主题范围偏窄。" },
      { label = "谍报", texture = "LaunchBar_Hook_Espionage", tooltip = "LaunchBar_Hook_Espionage\n情报识别度高，但气质偏隐秘行动。" },
      { label = "政体", texture = "LaunchBar_Hook_Government", tooltip = "LaunchBar_Hook_Government\n当前对照项，容易与政体/市政入口接近。" }
    }
  },
  {
    control = "IconPreviewAdvisorRow",
    candidates = {
      { label = "文化", icon = "ADVISOR_CULTURE", iconSize = 32, tooltip = "ADVISOR_CULTURE\n顾问体系图标，偏文化规划。" },
      { label = "科技", icon = "ADVISOR_TECHNOLOGY", iconSize = 32, tooltip = "ADVISOR_TECHNOLOGY\n顾问体系图标，偏科技规划。" },
      { label = "军事", icon = "ADVISOR_CONQUEST", iconSize = 32, tooltip = "ADVISOR_CONQUEST\n顾问体系图标，偏军事态势。" },
      { label = "信仰", icon = "ADVISOR_RELIGIOUS", iconSize = 32, tooltip = "ADVISOR_RELIGIOUS\n顾问体系图标，偏宗教与信仰。" },
      { label = "人物", icon = "ICON_GREAT_PERSON", iconSize = 32, tooltip = "ICON_GREAT_PERSON\n人物/副官感较强，但可能与伟人入口混淆。" },
      { label = "领袖", icon = "ICON_CIVILOPEDIA_LEADERS", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_LEADERS\n人物/领袖语义，可作为副官感的补充参考。" },
      { label = "伟人", icon = "ICON_CIVILOPEDIA_GREATPEOPLE", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_GREATPEOPLE\n人物与人才语义，可能与伟人系统重叠。" },
      { label = "概念", icon = "ICON_CIVILOPEDIA_CONCEPTS", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_CONCEPTS\n知识库/说明书语义，偏参考资料入口。" }
    }
  },
  {
    control = "IconPreviewNotificationRow",
    candidates = {
      { label = "通用", icon = "ICON_NOTIFICATION_GENERIC", iconSize = 40, tooltip = "ICON_NOTIFICATION_GENERIC\n通用提示图标，入口感中性。" },
      { label = "外交", icon = "ICON_NOTIFICATION_DIPLOMACY_SESSION", iconSize = 40, tooltip = "ICON_NOTIFICATION_DIPLOMACY_SESSION\n外交会话提示，适合公共外交情报语义。" },
      { label = "发现", icon = "ICON_NOTIFICATION_DISCOVER_GROUP", iconSize = 40, tooltip = "ICON_NOTIFICATION_DISCOVER_GROUP\n发现/情报更新语义较强。" },
      { label = "政体", icon = "ICON_NOTIFICATION_CONSIDER_GOVERNMENT_CHANGE", iconSize = 40, tooltip = "ICON_NOTIFICATION_CONSIDER_GOVERNMENT_CHANGE\n政体变更提示，偏政策规划。" },
      { label = "科技", icon = "ICON_NOTIFICATION_CHOOSE_TECH", iconSize = 40, tooltip = "ICON_NOTIFICATION_CHOOSE_TECH\n科技选择提示，可能与科技入口重叠。" },
      { label = "市政", icon = "ICON_NOTIFICATION_CHOOSE_CIVIC", iconSize = 40, tooltip = "ICON_NOTIFICATION_CHOOSE_CIVIC\n市政选择提示，可能与市政入口重叠。" },
      { label = "间谍", icon = "ICON_NOTIFICATION_SPY_GROUP", iconSize = 40, tooltip = "ICON_NOTIFICATION_SPY_GROUP\n情报感强，但容易偏向间谍系统。" },
      { label = "任务", icon = "ICON_NOTIFICATION_CITYSTATE_QUEST_GIVEN", iconSize = 40, tooltip = "ICON_NOTIFICATION_CITYSTATE_QUEST_GIVEN\n任务/待办语义，适合提示型入口参考。" }
    }
  },
  {
    control = "IconPreviewDiplomacyRow",
    candidates = {
      { label = "代表", icon = "ICON_DIPLOACTION_DIPLOMATIC_DELEGATION", iconSize = 38, tooltip = "ICON_DIPLOACTION_DIPLOMATIC_DELEGATION\n外交代表语义，偏正式交流。" },
      { label = "使馆", icon = "ICON_DIPLOACTION_RESIDENT_EMBASSY", iconSize = 38, tooltip = "ICON_DIPLOACTION_RESIDENT_EMBASSY\n外交驻节语义，正式但较窄。" },
      { label = "研究", icon = "ICON_DIPLOACTION_RESEARCH_AGREEMENT", iconSize = 38, tooltip = "ICON_DIPLOACTION_RESEARCH_AGREEMENT\n研究协定语义，偏科技合作。" },
      { label = "同盟", icon = "ICON_DIPLOACTION_ALLIANCE", iconSize = 38, tooltip = "ICON_DIPLOACTION_ALLIANCE\n关系/联盟语义，偏外交。" },
      { label = "贸易", icon = "ICON_DIPLOACTION_PROPOSE_TRADE", iconSize = 38, tooltip = "ICON_DIPLOACTION_PROPOSE_TRADE\n交易语义明确，但可能与贸易入口重叠。" },
      { label = "友谊", icon = "ICON_DIPLOACTION_DECLARE_FRIENDSHIP", iconSize = 38, tooltip = "ICON_DIPLOACTION_DECLARE_FRIENDSHIP\n关系语义，偏外交态势。" },
      { label = "宗主", icon = "ICON_RELATIONSHIP_SUZERAIN", iconSize = 31, tooltip = "ICON_RELATIONSHIP_SUZERAIN\n关系状态图标，适合外交态势参考。" },
      { label = "中立", icon = "ICON_RELATIONSHIP_NEUTRAL", iconSize = 31, tooltip = "ICON_RELATIONSHIP_NEUTRAL\n关系状态图标，较中性但尺寸偏小。" }
    }
  },
  {
    control = "IconPreviewAtlasRow",
    candidates = {
      { label = "定位", icon = "ICON_POSITION", iconSize = 32, tooltip = "ICON_POSITION\n中性定位标记，体积克制，但辨识度偏弱。" },
      { label = "队列", icon = "ICON_QUEUE", iconSize = 32, tooltip = "ICON_QUEUE\n偏规划语义，但容易联想到生产队列。" },
      { label = "人物", icon = "ICON_GREAT_PERSON", iconSize = 32, tooltip = "ICON_GREAT_PERSON\n有副官感，但可能与伟人入口混淆。" },
      { label = "指标", icon = "ICON_STATS_GENERIC_MODIFIER", iconSize = 32, tooltip = "ICON_STATS_GENERIC_MODIFIER\n偏分析与状态提示，存在感较弱。" },
      { label = "贸易", icon = "ICON_CITYSTATE_TRADE", iconSize = 32, tooltip = "ICON_CITYSTATE_TRADE\n贸易型城邦图标，偏经济与外交。" },
      { label = "科学", icon = "ICON_CITYSTATE_SCIENCE", iconSize = 32, tooltip = "ICON_CITYSTATE_SCIENCE\n科学型城邦图标，偏发展路线。" },
      { label = "圆点", icon = "ICON_MAP_PIN_CIRCLE", iconSize = 24, tooltip = "ICON_MAP_PIN_CIRCLE\n地图标记图标，中性但较轻。" },
      { label = "菱形", icon = "ICON_MAP_PIN_DIAMOND", iconSize = 24, tooltip = "ICON_MAP_PIN_DIAMOND\n地图标记图标，简洁但语义弱。" }
    }
  },
  {
    control = "IconPreviewOverviewRow",
    candidates = {
      { label = "技术", icon = "ICON_CIVILOPEDIA_TECHNOLOGIES", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_TECHNOLOGIES\n百科技术入口，适合路线分析参考。" },
      { label = "市政", icon = "ICON_CIVILOPEDIA_CIVICS", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_CIVICS\n百科市政入口，可能与市政按钮接近。" },
      { label = "政府", icon = "ICON_CIVILOPEDIA_GOVERNMENTS", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_GOVERNMENTS\n百科政府入口，偏制度与政策。" },
      { label = "文明", icon = "ICON_CIVILOPEDIA_CIVILIZATIONS", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_CIVILIZATIONS\n文明百科入口，偏宏观资料。" },
      { label = "城邦", icon = "ICON_CIVILOPEDIA_CITYSTATES", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_CITYSTATES\n城邦百科入口，偏外交信息。" },
      { label = "著作", icon = "ICON_GREATWORKOBJECT_WRITING", iconSize = 40, tooltip = "ICON_GREATWORKOBJECT_WRITING\n书写/记录语义，适合简报参考。" },
      { label = "文物", icon = "ICON_GREATWORKOBJECT_ARTIFACT_ERA_ANCIENT", iconSize = 40, tooltip = "ICON_GREATWORKOBJECT_ARTIFACT_ERA_ANCIENT\n档案/遗物语义，风格较游戏化。" },
      { label = "奇观", icon = "ICON_CIVILOPEDIA_WONDERS", iconSize = 32, tooltip = "ICON_CIVILOPEDIA_WONDERS\n百科奇观入口，偏资料与宏观规划。" }
    }
  }
}
local AUTO_SYNC_MIN_SECONDS = 2
local AUTO_SYNC_DELAY_SECONDS = 1
local VISIBLE_MAP_TILE_LIMIT = 1024
local VISIBLE_MAP_PLOTS_PER_FRAME = 96
local SNAPSHOT_CHUNKS_PER_FRAME = 64
local RAW_BYTES_PER_CHUNK = math.floor(CHUNK_SIZE / 4) * 3
local TURN_BRIEF_MODULES = {
  "selection", "cities", "units", "techs", "civics", "government", "policies", "resources", "diplomacyPublic", "economy",
  "governors", "trade", "cityStates"
}
local MAP_BRIEF_MODULES = { "units", "visibleMap", "diplomacyPublic" }
local FULL_BRIEF_MODULES = {
  "meta", "localPlayer", "selection", "cities", "units", "techs", "civics", "government", "policies", "resources", "diplomacyPublic", "visibleMap", "economy",
  "governors", "trade", "cityStates"
}

local unpackValues = table.unpack or unpack
local jsonKinds = setmetatable({}, { __mode = "k" })
local JSON_NULL = {}
local launchButtonInstance = {}
local launchPinInstance = {}
local launchButtonAttached = false
local iconPreviewBuilt = false
local autoSyncEnabled = false
local lastAutoSyncKey = nil
local lastAutoSyncAt = 0
local pendingAutoSync = nil
local activeSyncJob = nil
local copilotUpdateActive = false
local onCopilotUpdate = nil
local exportSequence = 0
local sessionNonce = tostring({}):gsub("[^%w]", "")
local SESSION_ID = "load-" .. tostring(os.time()) .. "-" .. sessionNonce
local captureCache = {
  playerId = nil,
  gameTurn = nil,
  sessionId = SESSION_ID,
  payloads = {},
  moduleStatus = {}
}
local currentStatus = nil
local syncProgressStatus = nil
local autoSyncStatus = nil

local function safeCall(fn, fallback)
  local values = { pcall(fn) }
  if values[1] then
    table.remove(values, 1)
    return unpackValues(values)
  end
  return fallback
end

local decisionDataLoadError = nil

local function loadDecisionData()
  if type(Civ6CopilotDecisionData) == "table" then
    return Civ6CopilotDecisionData
  end
  if type(include) ~= "function" then
    decisionDataLoadError = "include-unavailable"
    return nil
  end
  local loaded = pcall(include, "civ6_ai_copilot_decision_data")
  if not loaded then
    decisionDataLoadError = "include-failed"
    return nil
  end
  if type(Civ6CopilotDecisionData) ~= "table" then
    decisionDataLoadError = "module-not-defined"
    return nil
  end
  return Civ6CopilotDecisionData
end

local decisionData = loadDecisionData()

local function setStatus(message)
  currentStatus = message
  local visibleStatus = syncProgressStatus or autoSyncStatus or currentStatus
  if Controls and Controls.StatusLabel and visibleStatus ~= nil then
    Controls.StatusLabel:SetText(visibleStatus)
  end
end

local function lookupText(key, ...)
  local values = { ... }
  return safeCall(function()
		return Locale.Lookup(key, unpackValues(values))
  end, key) or key
end

local function setLastExportStatus(message)
  if Controls and Controls.LastExportLabel then
    Controls.LastExportLabel:SetText(message)
  end
end

local function setAutoSyncStatus(message)
  autoSyncStatus = message ~= "" and message or nil
  setStatus(currentStatus)
end

local function refreshAutoSyncButton()
  if Controls and Controls.AutoSyncButton then
    Controls.AutoSyncButton:SetText(Locale.Lookup(autoSyncEnabled and "LOC_CIV6_AI_COPILOT_AUTO_SYNC_ON" or "LOC_CIV6_AI_COPILOT_AUTO_SYNC_OFF"))
  end
end

local function setSyncProgress(message)
  syncProgressStatus = message or lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATING")
  setStatus(currentStatus)
end

local function clearSyncProgress()
  syncProgressStatus = nil
  setStatus(currentStatus)
end

local function nowUtc()
  local offset = os.date("%z") or "+0000"
  local sign = offset:sub(1, 1)
  local hours = offset:sub(2, 3)
  local minutes = offset:sub(4, 5)
  if (sign ~= "+" and sign ~= "-") or #hours ~= 2 or #minutes ~= 2 then
    return os.date("!%Y-%m-%dT%H:%M:%SZ")
  end
  return os.date("%Y-%m-%dT%H:%M:%S") .. sign .. hours .. ":" .. minutes
end

local function jsonEscape(value)
  return tostring(value)
    :gsub("\\", "\\\\")
    :gsub("\"", "\\\"")
    :gsub("\b", "\\b")
    :gsub("\f", "\\f")
    :gsub("\n", "\\n")
    :gsub("\r", "\\r")
    :gsub("\t", "\\t")
end

local function isArray(value)
  if type(value) ~= "table" then
    return false
  end
  local maxIndex = 0
  local count = 0
  for key, _ in pairs(value) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
      return false
    end
    if key > maxIndex then
      maxIndex = key
    end
    count = count + 1
  end
  return maxIndex == count
end

local function jsonArray(value)
  value = value or {}
  jsonKinds[value] = "array"
  return value
end

local function jsonObject(value)
  value = value or {}
  jsonKinds[value] = "object"
  return value
end

local function appendValue(out, value)
  out[#out + 1] = value
end

local function jsonWrite(out, value)
  if value == JSON_NULL then
    appendValue(out, "null")
    return
  end
  local valueType = type(value)
  if valueType == "nil" then
    appendValue(out, "null")
  elseif valueType == "boolean" then
    appendValue(out, value and "true" or "false")
  elseif valueType == "number" then
    appendValue(out, tostring(value))
  elseif valueType == "string" then
    appendValue(out, "\"")
    appendValue(out, jsonEscape(value))
    appendValue(out, "\"")
  elseif valueType == "table" then
    local jsonKind = jsonKinds[value]
    if jsonKind == "array" or (jsonKind == nil and isArray(value)) then
      appendValue(out, "[")
      for index = 1, #value do
        if index > 1 then
          appendValue(out, ",")
        end
        jsonWrite(out, value[index])
      end
      appendValue(out, "]")
      return
    end

    local first = true
    appendValue(out, "{")
    for key, child in pairs(value) do
      if first then
        first = false
      else
        appendValue(out, ",")
      end
      appendValue(out, "\"")
      appendValue(out, jsonEscape(key))
      appendValue(out, "\":")
      jsonWrite(out, child)
    end
    appendValue(out, "}")
  else
    appendValue(out, "null")
  end
end

local function jsonEncode(value)
  local out = {}
  jsonWrite(out, value)
  return table.concat(out)
end

local base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function base64Encode(data)
  local out = {}
  local length = #data
  local index = 1
  while index <= length do
    local b1 = data:byte(index) or 0
    local b2 = data:byte(index + 1)
    local b3 = data:byte(index + 2)
    local hasB2 = b2 ~= nil
    local hasB3 = b3 ~= nil
    b2 = b2 or 0
    b3 = b3 or 0

    local c1 = math.floor(b1 / 4)
    local c2 = (b1 % 4) * 16 + math.floor(b2 / 16)
    local c3 = (b2 % 16) * 4 + math.floor(b3 / 64)
    local c4 = b3 % 64

    appendValue(out, base64Chars:sub(c1 + 1, c1 + 1))
    appendValue(out, base64Chars:sub(c2 + 1, c2 + 1))
    appendValue(out, hasB2 and base64Chars:sub(c3 + 1, c3 + 1) or "=")
    appendValue(out, hasB3 and base64Chars:sub(c4 + 1, c4 + 1) or "=")
    index = index + 3
  end
  return table.concat(out)
end

local function base64SelfTestOk()
  return safeCall(function()
    return base64Encode("abc") == "YWJj"
  end, false)
end
local function emitDiagnostic(reason, extra)
  local localPlayerId = safeCall(function()
    return Game and Game.GetLocalPlayer and Game.GetLocalPlayer()
  end, nil)
  local localPlayer = localPlayerId ~= nil and Players and Players[localPlayerId] or nil
  local hasPlayerResources = safeCall(function()
    return localPlayer ~= nil and localPlayer.GetResources ~= nil and localPlayer:GetResources() ~= nil
  end, false)
  local hasPlayerTechs = safeCall(function()
    return localPlayer ~= nil and localPlayer.GetTechs ~= nil and localPlayer:GetTechs() ~= nil
  end, false)
  local hasPlayerCulture = safeCall(function()
    return localPlayer ~= nil and localPlayer.GetCulture ~= nil and localPlayer:GetCulture() ~= nil
  end, false)
  local payload = {
    modVersion = MOD_VERSION,
    compatVersion = COMPAT_VERSION,
    protocolVersion = PROTOCOL_VERSION,
    reason = reason,
    base64SelfTest = base64SelfTestOk(),
    hasControls = Controls ~= nil,
    hasGame = Game ~= nil,
    hasPlayers = Players ~= nil,
    hasMap = Map ~= nil,
    hasUnitsInPlot = Units ~= nil and Units.GetUnitsInPlot ~= nil,
    hasPlayerResources = hasPlayerResources == true,
    hasGameInfoResources = GameInfo ~= nil and GameInfo.Resources ~= nil,
    hasPlayerTechs = hasPlayerTechs == true,
    hasGameInfoTechnologies = GameInfo ~= nil and GameInfo.Technologies ~= nil,
    hasPlayerCulture = hasPlayerCulture == true,
    hasGameInfoCivics = GameInfo ~= nil and GameInfo.Civics ~= nil,
    hasGameInfoGovernments = GameInfo ~= nil and GameInfo.Governments ~= nil,
    hasGameInfoPolicies = GameInfo ~= nil and GameInfo.Policies ~= nil,
    hasGameInfoGovernmentSlots = GameInfo ~= nil and GameInfo.GovernmentSlots ~= nil,
    emittedAt = nowUtc()
  }
  for key, value in pairs(extra or {}) do
    payload[key] = value
  end
  print(COPILOT_DIAGNOSTIC .. " " .. jsonEncode(payload))
end

local function cacheLatestExport(begin, beginJson, chunkJsons, endJson, diagnosticJson)
  if ExposedMembers == nil then
    return false
  end

  ExposedMembers.Civ6AICopilot = ExposedMembers.Civ6AICopilot or {}
  ExposedMembers.Civ6AICopilot.latestExport = {
    modVersion = MOD_VERSION,
    compatVersion = COMPAT_VERSION,
    protocolVersion = PROTOCOL_VERSION,
    exportId = begin.exportId,
    schemaVersion = begin.schemaVersion,
    chunkCount = begin.chunkCount,
    byteLength = begin.byteLength,
    beginJson = beginJson,
    chunkJsons = chunkJsons,
    endJson = endJson,
    diagnosticJson = diagnosticJson,
    cachedAt = nowUtc()
  }
  return true
end

local function namedType(typeName, name)
  return { type = typeName or "UNKNOWN", name = name or typeName or "Unknown" }
end

local function namedGameInfoEntry(row, typeField, fallbackType, fallbackName)
  local typeName = (row and row[typeField]) or fallbackType or "UNKNOWN"
  local nameKey = row and row.Name or nil
  local name = nameKey and safeCall(function()
    return Locale.Lookup(nameKey)
  end, nameKey) or fallbackName or typeName
  return namedType(typeName, name)
end

local function getGameInfoType(tableName, index, field)
  if index == nil or GameInfo == nil or GameInfo[tableName] == nil then
    return nil
  end
  local row = GameInfo[tableName][index]
  if row == nil then
    return nil
  end
  return row[field or "UnitType"] or row[tableName:sub(1, -2) .. "Type"] or row.Hash
end

local function gameInfoRowByHash(tableName, hashValue, typeField)
  if type(hashValue) ~= "number" or GameInfo == nil or GameInfo[tableName] == nil then
    return nil
  end

  local tableRef = GameInfo[tableName]
  local direct = safeCall(function()
    return tableRef[hashValue]
  end, nil)
  if direct ~= nil and direct[typeField] ~= nil then
    return direct
  end

  local found = nil
  safeCall(function()
    for row in tableRef() do
      if row and row.Hash == hashValue then
        found = row
        break
      end
    end
  end, nil)
  if found ~= nil then
    return found
  end

  safeCall(function()
    for _, row in pairs(tableRef) do
      if type(row) == "table" and row.Hash == hashValue then
        found = row
        break
      end
    end
  end, nil)
  return found
end

local function productionNamedType(productionHash)
  if productionHash == 0 then return namedType("NO_PRODUCTION", "待选生产") end
  if type(productionHash) ~= "number" then
    return namedType("UNKNOWN_PRODUCTION", "未知生产")
  end

  local productionTables = {
    { tableName = "Units", typeField = "UnitType" },
    { tableName = "Buildings", typeField = "BuildingType" },
    { tableName = "Districts", typeField = "DistrictType" },
    { tableName = "Projects", typeField = "ProjectType" }
  }
  for _, config in ipairs(productionTables) do
    local row = gameInfoRowByHash(config.tableName, productionHash, config.typeField)
    if row ~= nil then
      return namedGameInfoEntry(row, config.typeField, "UNKNOWN_PRODUCTION", "未知生产")
    end
  end

  return namedType("UNKNOWN_PRODUCTION", "未知生产")
end

local function currentProductionProgressAndCost(queue, productionHash)
  if queue == nil or type(productionHash) ~= "number" or productionHash == 0 then
    return nil, nil
  end

  local productionTables = {
    { tableName = "Units", typeField = "UnitType", progress = "GetUnitProgress", cost = "GetUnitCost" },
    { tableName = "Buildings", typeField = "BuildingType", progress = "GetBuildingProgress", cost = "GetBuildingCost" },
    { tableName = "Districts", typeField = "DistrictType", progress = "GetDistrictProgress", cost = "GetDistrictCost" },
    { tableName = "Projects", typeField = "ProjectType", progress = "GetProjectProgress", cost = "GetProjectCost" }
  }
  for _, config in ipairs(productionTables) do
    local row = gameInfoRowByHash(config.tableName, productionHash, config.typeField)
    if row ~= nil and type(row.Index) == "number" then
      local progress = safeCall(function()
        return queue[config.progress](queue, row.Index)
      end, nil)
      local costGetter = config.cost
      if config.tableName == "Units" then
        local formation = safeCall(function()
          return queue:GetCurrentProductionTypeModifier()
        end, nil)
        if MilitaryFormationTypes and formation == MilitaryFormationTypes.CORPS_FORMATION then
          costGetter = "GetUnitCorpsCost"
        elseif MilitaryFormationTypes and formation == MilitaryFormationTypes.ARMY_FORMATION then
          costGetter = "GetUnitArmyCost"
        end
      end
      local cost = safeCall(function()
        return queue[costGetter](queue, row.Index)
      end, nil)
      return type(progress) == "number" and progress >= 0 and progress or nil,
        type(cost) == "number" and cost >= 0 and cost or nil
    end
  end
  return nil, nil
end

local function nonNegativeIntegerOrNil(value)
  if type(value) == "number" and value >= 0 then
    return math.floor(value)
  end
  return nil
end

local function nonNegativeFiniteNumberOrNil(value)
  if type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge or value < 0 then
    return nil
  end
  return value
end

local function nonNegativeFiniteIntegerOrNil(value)
  local number = nonNegativeFiniteNumberOrNil(value)
  if number ~= nil and number % 1 == 0 then
    return number
  end
  return nil
end

local function getLocalPlayerId()
  local id = safeCall(function()
    return Game.GetLocalPlayer()
  end, nil)
  return type(id) == "number" and id or -1
end

local function unitSnapshotEntry(unit, ownerPlayerId, visibilityKind, confidenceKind)
  local unitId = safeCall(function()
    return unit:GetID()
  end, 0)
  local unitTypeIndex = safeCall(function()
    return unit:GetType()
  end, nil)
  local unitType = getGameInfoType("Units", unitTypeIndex, "UnitType") or tostring(unitTypeIndex or "UNKNOWN_UNIT")

  local entry = {
    source = "lua-api",
    visibility = visibilityKind,
    confidence = confidenceKind,
    id = "unit-" .. tostring(ownerPlayerId) .. "-" .. tostring(unitId),
    type = unitType,
    name = safeCall(function()
      return Locale.Lookup(unit:GetName())
    end, unitType) or unitType,
    ownerPlayerId = ownerPlayerId,
    x = safeCall(function()
      return unit:GetX()
    end, 0),
    y = safeCall(function()
      return unit:GetY()
    end, 0),
    damage = safeCall(function()
      return unit:GetDamage()
    end, nil)
  }
  if ownerPlayerId == getLocalPlayerId() then
    local movesRemaining = safeCall(function()
      return unit:GetMovesRemaining()
    end, nil)
    if type(movesRemaining) == "number" and movesRemaining >= 0 then
      entry.movesRemaining = movesRemaining
    end
    local formationClass = safeCall(function()
      return unit:GetFormationClass()
    end, nil)
    if formationClass ~= nil then
      entry.formationClass = tostring(formationClass)
    end
    for fieldName, methodName in pairs({
      combatStrength = "GetCombat",
      rangedStrength = "GetRangedCombat",
      bombardStrength = "GetBombardCombat",
      range = "GetRange",
      maxMoves = "GetMaxMoves",
      buildCharges = "GetBuildCharges",
      militaryFormation = "GetMilitaryFormation",
      upgradeCost = "GetUpgradeCost"
    }) do
      local strength = safeCall(function()
        return unit[methodName](unit)
      end, nil)
      if fieldName == "militaryFormation" and strength ~= nil and MilitaryFormationTypes then
        if strength == MilitaryFormationTypes.STANDARD_FORMATION then
          entry.militaryFormation = "standard"
        elseif strength == MilitaryFormationTypes.CORPS_FORMATION then
          entry.militaryFormation = "corps"
        elseif strength == MilitaryFormationTypes.ARMY_FORMATION then
          entry.militaryFormation = "army"
        end
      elseif fieldName == "buildCharges" then
        local charges = nonNegativeFiniteIntegerOrNil(strength)
        if charges ~= nil then entry[fieldName] = charges end
      elseif (fieldName == "range" or fieldName == "maxMoves" or fieldName == "upgradeCost"
          or fieldName == "combatStrength" or fieldName == "rangedStrength" or fieldName == "bombardStrength")
          then
        local value = nonNegativeFiniteNumberOrNil(strength)
        if value ~= nil then entry[fieldName] = value end
      end
    end
    local experience = safeCall(function()
      return unit:GetExperience()
    end, nil)
    for fieldName, methodName in pairs({
      experience = "GetExperiencePoints",
      experienceForNextLevel = "GetExperienceForNextLevel",
      level = "GetLevel"
    }) do
      local value = safeCall(function()
        return experience and experience[methodName](experience)
      end, nil)
      if fieldName == "level" then
        value = nonNegativeFiniteIntegerOrNil(value)
      else
        value = nonNegativeFiniteNumberOrNil(value)
      end
      if type(value) == "number" then
        entry[fieldName] = value
      end
    end
    local promotions = safeCall(function()
      return experience and experience:GetPromotions()
    end, nil)
    if type(promotions) == "table" then
      local promotionEntries = jsonArray({})
      for _, promotionIndex in ipairs(promotions) do
        local promotionRow = safeCall(function()
          return GameInfo and GameInfo.UnitPromotions and GameInfo.UnitPromotions[promotionIndex]
        end, nil)
        if promotionRow and promotionRow.UnitPromotionType then
          local promotion = { type = promotionRow.UnitPromotionType }
          local name = safeCall(function()
            return promotionRow.Name and Locale.Lookup(promotionRow.Name)
          end, nil)
          if type(name) == "string" and name ~= "" then
            promotion.name = name
          end
          table.insert(promotionEntries, promotion)
        end
      end
      entry.promotions = promotionEntries
    end
  end
  if type(entry.damage) ~= "number" then
    entry.damage = nil
  end
  return entry
end

local function collectLocalPlayer(localPlayerId)
  local player = Players and Players[localPlayerId]
  local civilizationType = safeCall(function()
    return PlayerConfigurations[localPlayerId]:GetCivilizationTypeName()
  end, "UNKNOWN_CIVILIZATION") or "UNKNOWN_CIVILIZATION"
  local leaderType = safeCall(function()
    return PlayerConfigurations[localPlayerId]:GetLeaderTypeName()
  end, "UNKNOWN_LEADER") or "UNKNOWN_LEADER"

  return {
    source = "lua-api",
    visibility = "own",
    confidence = player and "confirmed" or "low",
    localPlayerId = localPlayerId,
    civilizationType = civilizationType,
    leaderType = leaderType,
    isHuman = safeCall(function()
      return player:IsHuman()
    end, true)
  }
end

local function collectCities(localPlayerId)
  local player = Players and Players[localPlayerId]
  if not player then
    return {}
  end

  local cities = jsonArray({})
  local playerCities = safeCall(function()
    return player:GetCities()
  end, nil)
  if not playerCities then
    return cities
  end

  for _, city in playerCities:Members() do
    local cityId = safeCall(function()
      return city:GetID()
    end, #cities + 1)
    local productionType = safeCall(function()
      local queue = city:GetBuildQueue()
      return queue and queue:GetCurrentProductionTypeHash()
    end, nil)
    local buildQueue = safeCall(function()
      return city:GetBuildQueue()
    end, nil)
    local productionProgress, productionCost = currentProductionProgressAndCost(buildQueue, productionType)
    local turnsUntilComplete = nonNegativeIntegerOrNil(safeCall(function()
      local queue = city:GetBuildQueue()
      return queue and queue:GetTurnsLeft()
    end, nil))
    local yields = jsonObject({})
    local wantedYields = {
      YIELD_FOOD = true,
      YIELD_PRODUCTION = true,
      YIELD_GOLD = true,
      YIELD_SCIENCE = true,
      YIELD_CULTURE = true,
      YIELD_FAITH = true
    }
    if GameInfo and GameInfo.Yields then
      safeCall(function()
        for row in GameInfo.Yields() do
          if row and wantedYields[row.YieldType] and type(row.Index) == "number" then
            local amount = safeCall(function()
              return city:GetYield(row.Index)
            end, nil)
            if type(amount) == "number" then
              yields[row.YieldType] = amount
            end
          end
        end
      end, nil)
    end
    local growth = safeCall(function()
      return city:GetGrowth()
    end, nil)
    local housing = safeCall(function() return growth and growth:GetHousing() end, nil)
    local amenities = safeCall(function() return growth and growth:GetAmenities() end, nil)
    local amenitiesNeeded = safeCall(function() return growth and growth:GetAmenitiesNeeded() end, nil)
    local turnsUntilGrowth = nonNegativeIntegerOrNil(safeCall(function()
      return growth and growth:GetTurnsUntilGrowth()
    end, nil))
    local turnsUntilStarvation = nonNegativeIntegerOrNil(safeCall(function()
      return growth and growth:GetTurnsUntilStarvation()
    end, nil))
    local foodStock = safeCall(function() return growth and growth:GetFood() end, nil)
    local foodSurplus = safeCall(function() return growth and growth:GetFoodSurplus() end, nil)
    local growthThreshold = safeCall(function() return growth and growth:GetGrowthThreshold() end, nil)

    local districtsComponent = safeCall(function()
      return city:GetDistricts()
    end, nil)
    local populationLimitedDistrictsUsed = safeCall(function()
      return districtsComponent:GetNumZonedDistrictsRequiringPopulation()
    end, nil)
    local populationLimitedDistrictsCapacity = safeCall(function()
      return districtsComponent:GetNumAllowedDistrictsRequiringPopulation()
    end, nil)
    populationLimitedDistrictsUsed = nonNegativeIntegerOrNil(populationLimitedDistrictsUsed)
    populationLimitedDistrictsCapacity = nonNegativeIntegerOrNil(populationLimitedDistrictsCapacity)
    local districts = nil
    if districtsComponent and type(districtsComponent.Members) == "function" then
      local districtEntries = jsonArray({})
      local districtsOk = pcall(function()
        for _, district in districtsComponent:Members() do
          local districtIndex = district:GetType()
          local districtRow = GameInfo and GameInfo.Districts and GameInfo.Districts[districtIndex]
          if type(districtIndex) ~= "number" or districtRow == nil or districtRow.DistrictType == nil then
            error("district type could not be resolved")
          end
          local districtEntry = namedGameInfoEntry(districtRow, "DistrictType", "UNKNOWN_DISTRICT", "未知区域")
          local hasDistrictOk, isBuilt = pcall(function()
            return districtsComponent:HasDistrict(districtRow.Index, true)
          end)
          if hasDistrictOk and type(isBuilt) == "boolean" then districtEntry.isBuilt = isBuilt end
          table.insert(districtEntries, districtEntry)
        end
      end)
      if districtsOk then
        districts = districtEntries
      end
    end

    local buildingsComponent = safeCall(function()
      return city:GetBuildings()
    end, nil)
    local buildings = nil
    local buildingReads = 0
    if buildingsComponent and type(buildingsComponent.HasBuilding) == "function" and GameInfo and GameInfo.Buildings then
      local buildingEntries = jsonArray({})
      local buildingsOk = pcall(function()
        for row in GameInfo.Buildings() do
          if row == nil or type(row.Index) ~= "number" or row.BuildingType == nil then
            error("building type could not be resolved")
          end
          local queryOk, hasBuilding = pcall(function()
            return buildingsComponent:HasBuilding(row.Index)
          end)
          if not queryOk or type(hasBuilding) ~= "boolean" then
            error("building state could not be read")
          end
          buildingReads = buildingReads + 1
          if hasBuilding then
            table.insert(buildingEntries, namedGameInfoEntry(row, "BuildingType", "UNKNOWN_BUILDING", "未知建筑"))
          end
        end
      end)
      if buildingsOk and buildingReads > 0 then buildings = buildingEntries end
    end

    local underSiege = safeCall(function()
      local playerDistricts = player:GetDistricts()
      local mainDistrict = playerDistricts and playerDistricts:FindID(city:GetDistrictID())
      return mainDistrict and mainDistrict:IsUnderSiege()
    end, nil)

    local cityEntry = {
      source = "lua-api",
      visibility = "own",
      confidence = "confirmed",
      id = "city-" .. tostring(localPlayerId) .. "-" .. tostring(cityId),
      name = safeCall(function()
        return Locale.Lookup(city:GetName())
      end, "City"),
      ownerPlayerId = localPlayerId,
      x = safeCall(function()
        return city:GetX()
      end, 0),
      y = safeCall(function()
        return city:GetY()
      end, 0),
      population = safeCall(function()
        return city:GetPopulation()
      end, 1),
      currentProduction = productionNamedType(productionType),
      turnsUntilComplete = turnsUntilComplete,
      yields = yields
    }
    if type(housing) == "number" then cityEntry.housing = housing end
    if type(amenities) == "number" then cityEntry.amenities = amenities end
    if type(amenitiesNeeded) == "number" then cityEntry.amenitiesNeeded = amenitiesNeeded end
    if turnsUntilGrowth ~= nil then cityEntry.turnsUntilGrowth = turnsUntilGrowth end
    if turnsUntilStarvation ~= nil then cityEntry.turnsUntilStarvation = turnsUntilStarvation end
    if type(productionProgress) == "number" and productionProgress >= 0 then cityEntry.currentProductionProgress = productionProgress end
    if type(productionCost) == "number" and productionCost >= 0 then cityEntry.currentProductionCost = productionCost end
    if type(foodStock) == "number" and foodStock >= 0 then cityEntry.foodStock = foodStock end
    if type(foodSurplus) == "number" then cityEntry.foodSurplus = foodSurplus end
    if type(growthThreshold) == "number" and growthThreshold >= 0 then cityEntry.growthThreshold = growthThreshold end
    if type(populationLimitedDistrictsUsed) == "number" then cityEntry.populationLimitedDistrictsUsed = populationLimitedDistrictsUsed end
    if type(populationLimitedDistrictsCapacity) == "number" then cityEntry.populationLimitedDistrictsCapacity = populationLimitedDistrictsCapacity end
    if type(underSiege) == "boolean" then cityEntry.underSiege = underSiege end
    if buildings ~= nil then cityEntry.buildings = buildings end
    if districts ~= nil then cityEntry.districts = districts end
    table.insert(cities, cityEntry)
  end
  return cities
end

local function selectedEntity(getterName, localPlayerId, idPrefix)
  local getter = safeCall(function()
    return UI and UI[getterName]
  end, nil)
  if type(getter) ~= "function" then
    return { status = "unsupported", id = JSON_NULL }
  end

  local ok, entity = pcall(getter)
  if not ok then
    return { status = "error", id = JSON_NULL }
  end
  if entity == nil then
    return { status = "none", id = JSON_NULL }
  end

  local ownerPlayerId = safeCall(function()
    return entity:GetOwner()
  end, nil)
  if type(ownerPlayerId) ~= "number" then
    return { status = "error", id = JSON_NULL }
  end
  if ownerPlayerId ~= localPlayerId then
    return { status = "none", id = JSON_NULL }
  end

  local entityId = safeCall(function()
    return entity:GetID()
  end, nil)
  if type(entityId) ~= "number" then
    return { status = "error", id = JSON_NULL }
  end
  return { status = "selected", id = idPrefix .. tostring(localPlayerId) .. "-" .. tostring(entityId) }
end

local function collectSelection(localPlayerId)
  local city = selectedEntity("GetHeadSelectedCity", localPlayerId, "city-")
  local unit = selectedEntity("GetHeadSelectedUnit", localPlayerId, "unit-")
  local confidence = "confirmed"
  if city.status == "unsupported" or city.status == "error" or unit.status == "unsupported" or unit.status == "error" then
    confidence = "low"
  end
  return {
    source = "lua-api",
    visibility = "own",
    confidence = confidence,
    city = city,
    unit = unit
  }
end

local function collectUnits(localPlayerId)
  local player = Players and Players[localPlayerId]
  if not player then
    return {}
  end

  local units = jsonArray({})
  local playerUnits = safeCall(function()
    return player:GetUnits()
  end, nil)
  if not playerUnits then
    return units
  end

  for _, unit in playerUnits:Members() do
    table.insert(units, unitSnapshotEntry(unit, localPlayerId, "own", "confirmed"))
  end
  return units
end

local function appendMissingUnits(targetUnits, sourceUnits)
  local seen = {}
  for _, unit in ipairs(targetUnits or {}) do
    seen[unit.id] = true
  end
  for _, unit in ipairs(sourceUnits or {}) do
    if not seen[unit.id] then
      table.insert(targetUnits, unit)
      seen[unit.id] = true
    end
  end
end

local function collectUnitsInVisiblePlot(plot, localPlayerId, seenUnitIds, playerVisibility)
  local unitIds = jsonArray({})
  local visibleForeignUnits = jsonArray({})
  local unverifiedForeignUnit = false
  local plotUnits = safeCall(function()
    if Units and Units.GetUnitsInPlot then
      return Units.GetUnitsInPlot(plot)
    end
    return nil
  end, nil)

  if type(plotUnits) ~= "table" then
    return unitIds, visibleForeignUnits, true
  end

  for _, unit in pairs(plotUnits) do
    local ownerPlayerId = safeCall(function()
      return unit:GetOwner()
    end, nil)
    local isOwnUnit = ownerPlayerId == localPlayerId
    local unitVisible = isOwnUnit
    if ownerPlayerId ~= nil and not isOwnUnit then
      if playerVisibility and type(playerVisibility.IsUnitVisible) == "function" then
        local checkOk, isUnitVisible = pcall(function()
          return playerVisibility:IsUnitVisible(unit)
        end)
        unitVisible = checkOk and isUnitVisible == true
        if not checkOk or type(isUnitVisible) ~= "boolean" then
          unverifiedForeignUnit = true
        end
      else
        unverifiedForeignUnit = true
      end
    end
    if ownerPlayerId ~= nil and unitVisible then
      local snapshotUnit = unitSnapshotEntry(
        unit,
        ownerPlayerId,
        ownerPlayerId == localPlayerId and "own" or "visible-now",
        "confirmed"
      )
      table.insert(unitIds, snapshotUnit.id)
      if ownerPlayerId ~= localPlayerId and not seenUnitIds[snapshotUnit.id] then
        table.insert(visibleForeignUnits, snapshotUnit)
        seenUnitIds[snapshotUnit.id] = true
      end
    end
  end

  return unitIds, visibleForeignUnits, unverifiedForeignUnit
end

local function gameInfoTypeNameByIndex(tableName, typeField, index)
  if type(index) ~= "number" or index < 0 or GameInfo == nil or GameInfo[tableName] == nil then
    return nil
  end

  local row = safeCall(function()
    return GameInfo[tableName][index]
  end, nil)
  if row ~= nil and row[typeField] ~= nil then
    return row[typeField]
  end

  return nil
end

local function plotTerrainType(plot)
  local terrainIndex = safeCall(function()
    return plot and plot:GetTerrainType()
  end, -1)
  return gameInfoTypeNameByIndex("Terrains", "TerrainType", terrainIndex)
end

local function plotFeatureType(plot)
  local featureIndex = safeCall(function()
    return plot and plot:GetFeatureType()
  end, -1)
  return gameInfoTypeNameByIndex("Features", "FeatureType", featureIndex)
end

local function plotIndexedType(plot, methodName, tableName, typeField)
  local index = safeCall(function()
    if plot == nil or plot[methodName] == nil then
      return -1
    end
    return plot[methodName](plot)
  end, -1)
  return gameInfoTypeNameByIndex(tableName, typeField, index)
end

local function plotOptionalBoolean(plot, methodName)
  local value = safeCall(function()
    if plot == nil or plot[methodName] == nil then
      return nil
    end
    return plot[methodName](plot)
  end, nil)
  if type(value) == "boolean" then
    return value
  end
  return nil
end

local function plotOptionalNumber(plot, methodName)
  local value = safeCall(function()
    if plot == nil or plot[methodName] == nil then
      return nil
    end
    return plot[methodName](plot)
  end, nil)
  if type(value) == "number" then
    return value
  end
  return nil
end

local function setOptionalBoolean(tile, fieldName, plot, methodName)
  local value = plotOptionalBoolean(plot, methodName)
  if value ~= nil then
    tile[fieldName] = value
  end
end

local function plotRiverEdges(plot)
  local edges = jsonArray({})
  if plotOptionalBoolean(plot, "IsWOfRiver") == true then
    table.insert(edges, "W")
  end
  if plotOptionalBoolean(plot, "IsNWOfRiver") == true then
    table.insert(edges, "NW")
  end
  if plotOptionalBoolean(plot, "IsNEOfRiver") == true then
    table.insert(edges, "NE")
  end
  if #edges > 0 then
    return edges
  end
  return nil
end

local function plotCliffEdges(plot)
  local edges = jsonArray({})
  if plotOptionalBoolean(plot, "IsWOfCliff") == true then
    table.insert(edges, "W")
  end
  if plotOptionalBoolean(plot, "IsNWOfCliff") == true then
    table.insert(edges, "NW")
  end
  if plotOptionalBoolean(plot, "IsNEOfCliff") == true then
    table.insert(edges, "NE")
  end
  if #edges > 0 then
    return edges
  end
  return nil
end

local yieldDescriptors = nil
local function getYieldDescriptors()
  if yieldDescriptors ~= nil then return yieldDescriptors end
  local rows = {}
  local ok = safeCall(function()
    for row in GameInfo.Yields() do
      if type(row.Index) == "number" and row.YieldType then
        table.insert(rows, { Index = row.Index, YieldType = row.YieldType })
      end
    end
    return true
  end, false)
  if ok then yieldDescriptors = rows end
  return rows
end

local function plotYields(plot)
  if plot == nil or GameInfo == nil or GameInfo.Yields == nil then
    return nil
  end

  local yields = jsonObject({})
  local hasYield = false
  safeCall(function()
    for _, row in ipairs(getYieldDescriptors()) do
      if row and row.YieldType ~= nil and type(row.Index) == "number" then
        local amount = safeCall(function()
          return plot:GetYield(row.Index)
        end, nil)
        if type(amount) == "number" and amount ~= 0 then
          yields[row.YieldType] = amount
          hasYield = true
        end
      end
    end
  end, nil)

  if hasYield then
    return yields
  end
  return nil
end

local function enrichTilePlanningFields(tile, plot)
  setOptionalBoolean(tile, "isWater", plot, "IsWater")
  setOptionalBoolean(tile, "isLake", plot, "IsLake")
  setOptionalBoolean(tile, "isCoastalLand", plot, "IsCoastalLand")
  setOptionalBoolean(tile, "isFreshWater", plot, "IsFreshWater")
  setOptionalBoolean(tile, "isHills", plot, "IsHills")
  setOptionalBoolean(tile, "isMountain", plot, "IsMountain")
  setOptionalBoolean(tile, "isImpassable", plot, "IsImpassable")
  setOptionalBoolean(tile, "isNaturalWonder", plot, "IsNaturalWonder")

  local riverEdges = plotRiverEdges(plot)
  if riverEdges ~= nil then
    tile.riverEdges = riverEdges
    tile.isRiver = true
  else
    setOptionalBoolean(tile, "isRiver", plot, "IsRiver")
  end

  local cliffEdges = plotCliffEdges(plot)
  if cliffEdges ~= nil then
    tile.cliffEdges = cliffEdges
  end

  local appeal = plotOptionalNumber(plot, "GetAppeal")
  if appeal ~= nil then
    tile.appeal = appeal
  end

  local improvementType = plotIndexedType(plot, "GetImprovementType", "Improvements", "ImprovementType")
  if improvementType ~= nil then
    tile.improvementType = improvementType
  end

  local routeType = plotIndexedType(plot, "GetRouteType", "Routes", "RouteType")
  if routeType ~= nil then
    tile.routeType = routeType
  end

  local districtType = plotIndexedType(plot, "GetDistrictType", "Districts", "DistrictType")
  if districtType ~= nil then
    tile.districtType = districtType
  end

  local continentType = plotIndexedType(plot, "GetContinentType", "Continents", "ContinentType")
  if continentType ~= nil then
    tile.continentType = continentType
  end

  local yields = plotYields(plot)
  if yields ~= nil then
    tile.yields = yields
  end
end

local function visiblePlotResourceType(plot, playerResources)
  local resourceIndex = safeCall(function()
    return plot and plot:GetResourceType()
  end, -1)
  if type(resourceIndex) ~= "number" or resourceIndex < 0 or GameInfo == nil or GameInfo.Resources == nil then
    return nil
  end

  local resourceRow = safeCall(function()
    return GameInfo.Resources[resourceIndex]
  end, nil)
  local resourceHash = resourceRow and resourceRow.Hash or nil
  if resourceRow == nil or resourceRow.ResourceType == nil or resourceHash == nil then
    return nil
  end

  if playerResources == nil then
    return nil
  end

  local isVisible = safeCall(function()
    return playerResources:IsResourceVisible(resourceHash)
  end, false)
  if isVisible == true then
    return resourceRow.ResourceType
  end

  return nil
end

local function ownAnchorPositions(localPlayerId)
  local anchors = {}
  local player = Players and Players[localPlayerId]
  if not player then return anchors end

  for _, getterName in ipairs({ "GetCities", "GetUnits" }) do
    local members = safeCall(function()
      return player[getterName](player)
    end, nil)
    if members and members.Members then
      for _, entity in members:Members() do
        local x = safeCall(function() return entity:GetX() end, nil)
        local y = safeCall(function() return entity:GetY() end, nil)
        if type(x) == "number" and type(y) == "number" then
          table.insert(anchors, { x = x, y = y })
        end
      end
    end
  end
  return anchors
end

local function createVisibleMapCollector(localPlayerId)
  local collector = {
    tiles = jsonArray({}),
    visibleForeignUnits = jsonArray({}),
    seenVisibleForeignUnitIds = {},
    visibleCoords = {},
    nearbyCoords = {},
    otherCoords = {},
    selectedCoords = {},
    anchors = ownAnchorPositions(localPlayerId),
    nearKeys = {},
    revealedTileCount = 0,
    truncated = false,
    bounds = nil,
    scanIndex = 0,
    detailIndex = 1,
    x = 0,
    y = 0,
    phase = "scan",
    done = false,
    foreignUnitVisibilityUnverified = false,
    localPlayerId = localPlayerId
  }

  collector.visibility = safeCall(function()
    if PlayersVisibility and PlayersVisibility[localPlayerId] then
      return PlayersVisibility[localPlayerId]
    end
    if PlayerVisibilityManager then
      return PlayerVisibilityManager.GetPlayerVisibility(localPlayerId)
    end
    return nil
  end, nil)
  collector.foreignUnitVisibilityUnverified = not (collector.visibility and collector.visibility.IsUnitVisible and Units and Units.GetUnitsInPlot)
  collector.playerResources = safeCall(function()
    local player = Players and Players[localPlayerId]
    return player and player:GetResources()
  end, nil)
  collector.width, collector.height = safeCall(function()
    return Map.GetGridSize()
  end, 0)
  collector.width = collector.width or 0
  collector.height = collector.height or 0

  for _, anchor in ipairs(collector.anchors) do
    for dy = -3, 3 do
      for dx = -3, 3 do
        local y = anchor.y + dy
        local x = anchor.x + dx
        if x >= 0 and y >= 0 and x < collector.width and y < collector.height then
          collector.nearKeys[tostring(x) .. "," .. tostring(y)] = true
        end
      end
    end
  end

  function collector:result()
    local confidence = (self.visibility and Map and self.width > 0) and "confirmed" or "low"
    if self.foreignUnitVisibilityUnverified then confidence = "low" end
    return {
      source = "lua-api",
      visibility = "player-visible",
      confidence = confidence,
      scope = "player-visible-revealed",
      truncated = self.truncated,
      tileLimit = VISIBLE_MAP_TILE_LIMIT,
      revealedTileCount = self.revealedTileCount,
      bounds = self.bounds,
      tiles = self.tiles
    }, self.visibleForeignUnits, self.foreignUnitVisibilityUnverified
  end

  function collector:progress()
    local scanTotal = math.max(1, self.width * self.height)
    if self.phase == "scan" then
      return math.min(scanTotal, self.scanIndex), scanTotal
    end
    return scanTotal + self.detailIndex - 1, scanTotal + math.max(1, #self.selectedCoords)
  end

  function collector:nearOwnEntity(x, y)
    return self.nearKeys[tostring(x) .. "," .. tostring(y)] == true
  end

  function collector:selectPriorities()
    self.selectedCoords = {}
    table.sort(self.visibleCoords, function(a, b)
      local an, bn = self:nearOwnEntity(a.x, a.y), self:nearOwnEntity(b.x, b.y)
      if an ~= bn then return an end
      if a.y ~= b.y then return a.y < b.y end
      return a.x < b.x
    end)
    local function addBucket(bucket)
      for _, coord in ipairs(bucket) do
        if #self.selectedCoords >= VISIBLE_MAP_TILE_LIMIT then
          return false
        end
        table.insert(self.selectedCoords, coord)
      end
      return true
    end
    local hasRoom = addBucket(self.visibleCoords)
    if hasRoom then hasRoom = addBucket(self.nearbyCoords) end
    if hasRoom then addBucket(self.otherCoords) end
    self.truncated = self.revealedTileCount > #self.selectedCoords
    self.visibleCoords = nil
    self.nearbyCoords = nil
    self.otherCoords = nil
    self.phase = "detail"
  end

  function collector:updateBounds(x, y)
    if self.bounds == nil then
      self.bounds = { minX = x, maxX = x, minY = y, maxY = y }
      return
    end
    if x < self.bounds.minX then self.bounds.minX = x end
    if x > self.bounds.maxX then self.bounds.maxX = x end
    if y < self.bounds.minY then self.bounds.minY = y end
    if y > self.bounds.maxY then self.bounds.maxY = y end
  end

  function collector:step(maxPlots)
    if self.done then return true end
    if not self.visibility or not Map or self.width == 0 then
      self.done = true
      return true
    end

    local processed = 0
    if self.phase == "scan" then
      while self.y < self.height and processed < maxPlots do
        local x, y = self.x, self.y
        local revealed = safeCall(function()
          return self.visibility:IsRevealed(x, y)
        end, false) == true
        if revealed then
          self.revealedTileCount = self.revealedTileCount + 1
          local visibleNow = safeCall(function()
            return self.visibility:IsVisible(x, y)
          end, false) == true
          local coord = { x = x, y = y, visibleNow = visibleNow }
          if visibleNow then
            table.insert(self.visibleCoords, coord)
          elseif self:nearOwnEntity(x, y) then
            table.insert(self.nearbyCoords, coord)
          else
            table.insert(self.otherCoords, coord)
          end
        end

        self.x = self.x + 1
        if self.x >= self.width then
          self.x = 0
          self.y = self.y + 1
        end
        self.scanIndex = self.scanIndex + 1
        processed = processed + 1
      end
      if self.y >= self.height then self:selectPriorities() end
      return self.done
    end

    while self.detailIndex <= #self.selectedCoords and processed < maxPlots do
      local coord = self.selectedCoords[self.detailIndex]
      coord.visibleNow = safeCall(function()
        return self.visibility:IsVisible(coord.x, coord.y)
      end, false) == true
      local tile = {
        source = "lua-api",
        visibility = coord.visibleNow and "visible-now" or "revealed",
        confidence = "confirmed",
        x = coord.x,
        y = coord.y,
        revealed = true,
        visibleNow = coord.visibleNow
      }
      if coord.visibleNow then
        local plot = safeCall(function() return Map.GetPlot(coord.x, coord.y) end, nil)
        if plot then
          local ownerPlayerId = safeCall(function() return plot:GetOwner() end, nil)
          if type(ownerPlayerId) == "number" and ownerPlayerId >= 0 then
            tile.ownerPlayerId = ownerPlayerId
          end
          local terrainType = plotTerrainType(plot)
          if terrainType ~= nil then tile.terrainType = terrainType end
          local featureType = plotFeatureType(plot)
          if featureType ~= nil then tile.featureType = featureType end

          local visibleResourceType = visiblePlotResourceType(plot, self.playerResources)
          if visibleResourceType ~= nil then
            tile.resourceType = visibleResourceType
            local resourceAmount = plotOptionalNumber(plot, "GetResourceCount")
            if resourceAmount ~= nil and resourceAmount > 0 then
              tile.resourceAmount = resourceAmount
            end
          end
          enrichTilePlanningFields(tile, plot)

          local unitIds, tileForeignUnits, unverified = collectUnitsInVisiblePlot(
            plot, self.localPlayerId, self.seenVisibleForeignUnitIds, self.visibility
          )
          self.foreignUnitVisibilityUnverified = self.foreignUnitVisibilityUnverified or unverified
          if #unitIds > 0 then tile.unitIds = unitIds end
          appendMissingUnits(self.visibleForeignUnits, tileForeignUnits)
        end
      end
      self:updateBounds(coord.x, coord.y)
      table.insert(self.tiles, tile)
      self.detailIndex = self.detailIndex + 1
      processed = processed + 1
    end

    if self.detailIndex > #self.selectedCoords then self.done = true end
    return self.done
  end

  return collector
end

local function collectVisibleMap(localPlayerId)
  local collector = createVisibleMapCollector(localPlayerId)
  while not collector:step(1000000) do
  end
  return collector:result()
end

local function forEachGameInfoRow(tableName, typeField, callback)
  if GameInfo == nil or GameInfo[tableName] == nil then
    return false
  end

  local tableRef = GameInfo[tableName]
  local iterated = safeCall(function()
    for row in tableRef() do
      if row and row[typeField] ~= nil then
        callback(row)
      end
    end
    return true
  end, false)
  if iterated then
    return true
  end

  return safeCall(function()
    for _, row in pairs(tableRef) do
      if type(row) == "table" and row[typeField] ~= nil then
        callback(row)
      end
    end
    return true
  end, false) == true
end

local function namedGameInfo(row, typeField, fallbackType)
  return namedGameInfoEntry(row, typeField, fallbackType)
end

local function gameInfoRowByIndexOrType(tableName, key, typeField)
  if key == nil or GameInfo == nil or GameInfo[tableName] == nil then
    return nil
  end

  local direct = safeCall(function()
    return GameInfo[tableName][key]
  end, nil)
  if direct ~= nil then
    return direct
  end

  local found = nil
  forEachGameInfoRow(tableName, typeField, function(row)
    if found == nil and (row.Index == key or row[typeField] == key) then
      found = row
    end
  end)
  return found
end

local function componentCall(component, methodName, ...)
  if component == nil or component[methodName] == nil then
    return nil
  end
  local args = { ... }
  return safeCall(function()
    return component[methodName](component, unpackValues(args))
  end, nil)
end

local function collectProgression(kind, localPlayerId)
  local player = Players and Players[localPlayerId]
  local config
  if kind == "techs" then
    config = {
      getter = "GetTechs",
      tableName = "Technologies",
      typeField = "TechnologyType",
      unknown = "UNKNOWN_TECH",
      current = "GetResearchingTech",
      progress = "GetResearchProgress",
      cost = "GetResearchCost",
      completed = "HasTech",
      available = "CanResearch",
      boosted = "HasBoostBeenTriggered"
    }
  else
    config = {
      getter = "GetCulture",
      tableName = "Civics",
      typeField = "CivicType",
      unknown = "UNKNOWN_CIVIC",
      current = "GetProgressingCivic",
      progress = "GetCulturalProgress",
      cost = "GetCultureCost",
      completed = "HasCivic",
      available = "CanProgress",
      boosted = "HasBoostBeenTriggered"
    }
  end

  local completed = jsonArray({})
  local available = jsonArray({})
  local boosts = jsonArray({})
  local component = player and componentCall(player, config.getter) or nil
  local currentIndex = componentCall(component, config.current)
  local current = namedType(config.unknown)
  local reads = 0

  if type(currentIndex) == "number" and currentIndex >= 0 then
    local currentRow = gameInfoRowByIndexOrType(config.tableName, currentIndex, config.typeField)
    current = namedGameInfo(currentRow, config.typeField, tostring(currentIndex))
  end

  if component ~= nil then
    forEachGameInfoRow(config.tableName, config.typeField, function(row)
      local index = row.Index
      local typeName = row[config.typeField]
      if type(index) == "number" and typeName ~= nil then
        local isCompleted = componentCall(component, config.completed, index)
        if type(isCompleted) == "boolean" then
          reads = reads + 1
        end
        if isCompleted == true then
          table.insert(completed, namedGameInfo(row, config.typeField, typeName))
        else
          local canProgress = componentCall(component, config.available, index)
          if canProgress == true then
            table.insert(available, namedGameInfo(row, config.typeField, typeName))
          end
          if canProgress == true or index == currentIndex then
            local boostTriggered = componentCall(component, config.boosted, index)
            if type(boostTriggered) == "boolean" then
              table.insert(boosts, {
                type = typeName,
                boosted = boostTriggered,
                confidence = "confirmed"
              })
            end
          end
        end
      end
    end)
  end

  local result = {
    source = "lua-api",
    visibility = "own",
    confidence = reads > 0 and "confirmed" or "low",
    current = current,
    completed = completed,
    available = available,
    boosts = boosts
  }
  if type(currentIndex) == "number" and currentIndex >= 0 then
    local currentProgress = componentCall(component, config.progress, currentIndex)
    local currentCost = componentCall(component, config.cost, currentIndex)
    if type(currentProgress) == "number" then result.currentProgress = currentProgress end
    if type(currentCost) == "number" then result.currentCost = currentCost end
  end
  return result
end

local function incrementPolicySlot(policySlots, slotType)
  if slotType == nil then
    return
  end

  local slotRow = gameInfoRowByIndexOrType("GovernmentSlots", slotType, "GovernmentSlotType")
  local slotKey = (slotRow and slotRow.GovernmentSlotType) or tostring(slotType)
  policySlots[slotKey] = (policySlots[slotKey] or 0) + 1
end

local function addPolicy(policies, seenPolicies, policyIndexOrType)
  if policyIndexOrType == nil then
    return false
  end

  local policyRow = gameInfoRowByIndexOrType("Policies", policyIndexOrType, "PolicyType")
  local policyType = policyRow and policyRow.PolicyType or tostring(policyIndexOrType)
  if seenPolicies[policyType] then
    return true
  end

  seenPolicies[policyType] = true
  table.insert(policies, namedGameInfo(policyRow, "PolicyType", policyType))
  return true
end

local function collectGovernment(localPlayerId)
  local player = Players and Players[localPlayerId]
  local culture = player and componentCall(player, "GetCulture") or nil
  local currentGovernmentIndex = componentCall(culture, "GetCurrentGovernment")
  local currentGovernment = namedType("UNKNOWN_GOVERNMENT")
  local policySlots = jsonObject({})
  local policies = jsonArray({})
  local availablePolicies = jsonArray({})
  local availablePolicyReads, availablePoliciesKnown = 0, culture ~= nil
  local seenPolicies = {}
  local reads = 0

  if type(currentGovernmentIndex) == "number" and currentGovernmentIndex >= 0 then
    local governmentRow = gameInfoRowByIndexOrType("Governments", currentGovernmentIndex, "GovernmentType")
    currentGovernment = namedGameInfo(governmentRow, "GovernmentType", tostring(currentGovernmentIndex))
    reads = reads + 1
  end

  local slotCount = componentCall(culture, "GetNumPolicySlots")
  if type(slotCount) == "number" and slotCount > 0 then
    reads = reads + 1
    for slotIndex = 0, slotCount - 1 do
      local slotType = componentCall(culture, "GetSlotType", slotIndex)
      incrementPolicySlot(policySlots, slotType)
      local policyIndex = componentCall(culture, "GetSlotPolicy", slotIndex)
      if policyIndex ~= nil and policyIndex ~= -1 then
        addPolicy(policies, seenPolicies, policyIndex)
      end
    end
  end

  if #policies == 0 and culture ~= nil then
    forEachGameInfoRow("Policies", "PolicyType", function(row)
      local index = row.Index
      if type(index) == "number" and componentCall(culture, "IsPolicyActive", index) == true then
        reads = reads + 1
        addPolicy(policies, seenPolicies, index)
      end
    end)
  end

  if culture ~= nil then
    forEachGameInfoRow("Policies", "PolicyType", function(row)
      if row and type(row.Hash) == "number" and row.PolicyType ~= nil then
        local unlocked = componentCall(culture, "IsPolicyUnlocked", row.Hash)
        local obsolete = componentCall(culture, "IsPolicyObsolete", row.Hash)
        if type(unlocked) == "boolean" and type(obsolete) == "boolean" then
          availablePolicyReads = availablePolicyReads + 1
          reads = reads + 2
          if unlocked and not obsolete then
            table.insert(availablePolicies, {
              type = row.PolicyType,
              name = lookupText(row.Name or row.PolicyType),
              slotType = row.GovernmentSlotType,
              description = lookupText(row.Description or "")
            })
          end
        else
          availablePoliciesKnown = false
        end
      else
        availablePoliciesKnown = false
      end
    end)
  end

  -- Policy switching also depends on turn permissions and paid changes. Unknown
  -- until that UI decision can be reproduced completely; do not report false.
  local canChangePolicies = nil
  if not availablePoliciesKnown or availablePolicyReads == 0 then
    availablePolicies = nil
    emitDiagnostic("available-policies-unavailable")
  end

  return {
    source = "lua-api",
    visibility = "own",
    confidence = reads > 0 and availablePolicies ~= nil and "confirmed" or "low",
    currentGovernment = currentGovernment,
    policySlots = policySlots,
    policies = policies,
    availablePolicies = availablePolicies,
    canChangePolicies = canChangePolicies
  }
end

local function forEachGameInfoResource(callback)
  if GameInfo == nil or GameInfo.Resources == nil then
    return false
  end

  local iterated = safeCall(function()
    for row in GameInfo.Resources() do
      callback(row)
    end
    return true
  end, false)
  if iterated then
    return true
  end

  return safeCall(function()
    for _, row in pairs(GameInfo.Resources) do
      if type(row) == "table" and row.ResourceType ~= nil then
        callback(row)
      end
    end
    return true
  end, false) == true
end

local function localizedResourceName(row, resourceType)
  local nameKey = row and row.Name or nil
  if nameKey ~= nil then
    return safeCall(function()
      return Locale.Lookup(nameKey)
    end, nameKey) or nameKey
  end
  return resourceType
end

local function resourceIndex(row, resourceType)
  if row and row.Index ~= nil then
    return row.Index
  end
  return safeCall(function()
    return GameInfo.Resources[resourceType].Index
  end, nil)
end

local function resourceAmount(playerResources, row, resourceType)
  local index = resourceIndex(row, resourceType)
  local amount = safeCall(function()
    return playerResources:GetResourceAmount(index)
  end, nil)
  if type(amount) == "number" then
    return amount
  end

  amount = safeCall(function()
    return playerResources:GetResourceAmount(resourceType)
  end, nil)
  if type(amount) == "number" then
    return amount
  end

  return nil
end

local function collectResources(localPlayerId)
  local player = Players and Players[localPlayerId]
  local playerResources = player and safeCall(function()
    return player:GetResources()
  end, nil) or nil
  local items = jsonArray({})

  if playerResources == nil then
    return {
      source = "lua-api",
      visibility = "own",
      confidence = "low",
      items = items
    }
  end

  local seenResourceTypes = {}
  local amountReads = 0
  forEachGameInfoResource(function(row)
    local resourceType = row and row.ResourceType or nil
    if resourceType ~= nil and not seenResourceTypes[resourceType] then
      seenResourceTypes[resourceType] = true
      local amount = resourceAmount(playerResources, row, resourceType)
      if type(amount) == "number" then
        amountReads = amountReads + 1
        if amount > 0 then
          table.insert(items, {
            type = resourceType,
            name = localizedResourceName(row, resourceType),
            amount = amount
          })
        end
      end
    end
  end)

  return {
    source = "lua-api",
    visibility = "own",
    confidence = amountReads > 0 and "confirmed" or "low",
    items = items
  }
end

local function collectDiplomacy(localPlayerId)
  local metPlayers = jsonArray({})
  local localPlayer = Players and Players[localPlayerId]
  local diplomacy = localPlayer and componentCall(localPlayer, "GetDiplomacy") or nil
  if diplomacy == nil or PlayerManager == nil or PlayerConfigurations == nil then
    return {
      source = "lua-api",
      visibility = "public-known",
      confidence = "low",
      metPlayers = metPlayers
    }
  end

  local alivePlayerIds = safeCall(function()
    if PlayerManager.GetAliveMajorIDs then
      return PlayerManager.GetAliveMajorIDs()
    end
    return PlayerManager.GetAliveIDs()
  end, nil)
  if alivePlayerIds == nil then
    return {
      source = "lua-api",
      visibility = "public-known",
      confidence = "low",
      metPlayers = metPlayers
    }
  end

  for _, playerId in ipairs(alivePlayerIds) do
    if playerId ~= localPlayerId then
      local hasMet = componentCall(diplomacy, "HasMet", playerId)
      if hasMet == true then
        local otherPlayer = Players[playerId]
        local otherStats = otherPlayer and componentCall(otherPlayer, "GetStats") or nil
        local otherConfig = PlayerConfigurations[playerId]
        local isAtWar = componentCall(diplomacy, "IsAtWarWith", playerId)
        local row = {
          playerId = playerId,
          civilizationType = safeCall(function()
            return otherConfig and otherConfig:GetCivilizationTypeName()
          end, "UNKNOWN_CIVILIZATION") or "UNKNOWN_CIVILIZATION",
          leaderType = safeCall(function()
            return otherConfig and otherConfig:GetLeaderTypeName()
          end, nil),
          relationship = isAtWar == true and "war" or "met",
          visibility = "public-known",
          source = "lua-api",
          confidence = "confirmed"
        }
        local militaryScore = componentCall(otherStats, "GetMilitaryStrength")
        if type(militaryScore) == "number" then
          row.militaryScore = militaryScore
        end
        table.insert(metPlayers, row)
      end
    end
  end

  return {
    source = "lua-api",
    visibility = "public-known",
    confidence = "confirmed",
    metPlayers = metPlayers
  }
end

local function collectEconomy(localPlayerId)
  local player = Players and Players[localPlayerId]
  local technology = player and componentCall(player, "GetTechs") or nil
  local culture = player and componentCall(player, "GetCulture") or nil
  local religion = player and componentCall(player, "GetReligion") or nil
  local treasury = player and componentCall(player, "GetTreasury") or nil
  local economy = {
    source = "lua-api",
    visibility = "own",
    confidence = "low"
  }
  local reads = 0
  local values = {
    { "sciencePerTurn", technology, "GetScienceYield" },
    { "culturePerTurn", culture, "GetCultureYield" },
    { "faithPerTurn", religion, "GetFaithYield" },
    { "faithBalance", religion, "GetFaithBalance" },
    { "goldIncomePerTurn", treasury, "GetGoldYield" },
    { "goldMaintenancePerTurn", treasury, "GetTotalMaintenance" },
    { "goldBalance", treasury, "GetGoldBalance" }
  }
  for _, spec in ipairs(values) do
    local value = componentCall(spec[2], spec[3])
    if type(value) == "number" then
      economy[spec[1]] = value
      reads = reads + 1
    end
  end
  if type(economy.goldIncomePerTurn) == "number" and type(economy.goldMaintenancePerTurn) == "number" then
    economy.goldPerTurn = economy.goldIncomePerTurn - economy.goldMaintenancePerTurn
  end
  economy.confidence = reads == #values and "confirmed" or "low"
  return economy
end

local function hasModule(modules, moduleName)
  for _, value in ipairs(modules or {}) do
    if value == moduleName then
      return true
    end
  end
  return false
end

local function withCoreModules(extraModules)
  local modules = jsonArray({ "meta", "localPlayer", "selection" })
  for _, moduleName in ipairs(extraModules or {}) do
    if not hasModule(modules, moduleName) then
      table.insert(modules, moduleName)
    end
  end
  return modules
end

local function collectEmptyVisibleMap()
  return {
    source = "inferred",
    visibility = "player-visible",
    confidence = "low",
    scope = "player-visible-revealed",
    truncated = false,
    tileLimit = VISIBLE_MAP_TILE_LIMIT,
    revealedTileCount = 0,
    tiles = jsonArray({})
  }
end

local function collectEmptyProgression(unknownType)
  return {
    source = "inferred",
    visibility = "own",
    confidence = "low",
    current = namedType(unknownType),
    completed = jsonArray({}),
    available = jsonArray({}),
    boosts = jsonArray({})
  }
end

local function collectEmptyGovernment()
  return {
    source = "inferred",
    visibility = "own",
    confidence = "low",
    currentGovernment = namedType("UNKNOWN_GOVERNMENT"),
    policySlots = jsonObject({}),
    policies = jsonArray({}),
    canChangePolicies = false
  }
end

local function collectEmptyResources()
  return {
    source = "inferred",
    visibility = "own",
    confidence = "low",
    items = jsonArray({})
  }
end

local function collectEmptyDiplomacy()
  return {
    source = "inferred",
    visibility = "public-known",
    confidence = "low",
    metPlayers = jsonArray({})
  }
end

local function emptyDecisionDomain(moduleName)
  return {
    availability = "unavailable",
    source = "inferred",
    visibility = "player-visible",
    confidence = "low"
  }
end

local function collectDecisionDomain(moduleName, localPlayerId)
  local collectorNames = {
    governors = "collectGovernors",
    trade = "collectTrade",
    cityStates = "collectCityStates"
  }
  local collector = decisionData and decisionData[collectorNames[moduleName]]
  if type(collector) ~= "function" then
    emitDiagnostic("decision-data-collector-unavailable", { module = moduleName })
    return emptyDecisionDomain(moduleName)
  end
  local context = {
    safeCall = safeCall,
    jsonArray = jsonArray,
    jsonObject = jsonObject,
    lookupText = lookupText,
    player = Players and Players[localPlayerId] or nil
  }
  local ok, payload = pcall(collector, localPlayerId, context)
  if not ok or type(payload) ~= "table" then
    return emptyDecisionDomain(moduleName)
  end
  return payload
end

local function collectSnapshot(exportType, modules, options)
  options = options or {}
  modules = withCoreModules(modules)
  local localPlayerId = getLocalPlayerId()
  local gameTurn = safeCall(function()
    return Game.GetCurrentGameTurn()
  end, 0)
  exportSequence = exportSequence + 1
  local includeCities = hasModule(modules, "cities")
  local includeUnits = hasModule(modules, "units")
  local includeVisibleMap = hasModule(modules, "visibleMap")
  local includeTechs = hasModule(modules, "techs")
  local includeCivics = hasModule(modules, "civics")
  local includeGovernment = hasModule(modules, "government") or hasModule(modules, "policies")
  local includeResources = hasModule(modules, "resources")
  local includeDiplomacy = hasModule(modules, "diplomacyPublic")
  local includeGovernors = hasModule(modules, "governors")
  local includeTrade = hasModule(modules, "trade")
  local includeCityStates = hasModule(modules, "cityStates")
  local units = includeUnits and collectUnits(localPlayerId) or jsonArray({})
  local visibleMap = collectEmptyVisibleMap()
  local visibleForeignUnits = jsonArray({})
  if includeVisibleMap then
    if options.deferVisibleMap then
      visibleMap = options.visibleMap or collectEmptyVisibleMap()
      visibleForeignUnits = options.visibleForeignUnits or jsonArray({})
    else
      visibleMap, visibleForeignUnits = collectVisibleMap(localPlayerId)
    end
  end
  if includeUnits then
    appendMissingUnits(units, visibleForeignUnits)
  end

  return {
    schemaVersion = SCHEMA_VERSION,
    exportedAt = nowUtc(),
    source = {
      modId = MOD_ID,
      modVersion = MOD_VERSION,
      compatVersion = COMPAT_VERSION,
      protocolVersion = PROTOCOL_VERSION,
      transport = "lua-log",
      visibilityMode = "player-visible",
      exportId = SESSION_ID .. "-" .. tostring(localPlayerId) .. "-" .. tostring(exportSequence),
      exportType = exportType
    },
    session = {
      sessionId = SESSION_ID,
      idScope = "load",
      gameTurn = gameTurn,
      ruleset = safeCall(function()
        return tostring(GameConfiguration.GetValue("RULESET") or "UNKNOWN_RULESET")
      end, "UNKNOWN_RULESET"),
      gameSpeed = safeCall(function()
        return tostring(GameConfiguration.GetGameSpeedType() or "UNKNOWN_SPEED")
      end, "UNKNOWN_SPEED"),
      mapSize = safeCall(function()
        return tostring(GameConfiguration.GetMapSize() or "UNKNOWN_MAPSIZE")
      end, "UNKNOWN_MAPSIZE"),
      isMultiplayer = safeCall(function()
        return GameConfiguration.IsAnyMultiplayer()
      end, false)
    },
    localPlayer = collectLocalPlayer(localPlayerId),
    modules = modules,
    selection = collectSelection(localPlayerId),
    cities = includeCities and collectCities(localPlayerId) or jsonArray({}),
    units = units,
    visibleMap = visibleMap,
    techs = includeTechs and collectProgression("techs", localPlayerId) or collectEmptyProgression("UNKNOWN_TECH"),
    civics = includeCivics and collectProgression("civics", localPlayerId) or collectEmptyProgression("UNKNOWN_CIVIC"),
    government = includeGovernment and collectGovernment(localPlayerId) or collectEmptyGovernment(),
    resources = includeResources and collectResources(localPlayerId) or collectEmptyResources(),
    diplomacy = includeDiplomacy and collectDiplomacy(localPlayerId) or collectEmptyDiplomacy(),
    governors = includeGovernors and collectDecisionDomain("governors", localPlayerId) or emptyDecisionDomain("governors"),
    trade = includeTrade and collectDecisionDomain("trade", localPlayerId) or emptyDecisionDomain("trade"),
    cityStates = includeCityStates and collectDecisionDomain("cityStates", localPlayerId) or emptyDecisionDomain("cityStates"),
    economy = hasModule(modules, "economy") and collectEconomy(localPlayerId) or nil,
    attention = {
      {
        kind = "mvp-diagnostic",
        message = "Player-visible snapshot exported from civ6-ai-copilot UI context.",
        severity = "info",
        source = "lua-api",
        visibility = "own",
        confidence = "confirmed"
      }
    },
    confidence = {
      overall = "low"
    }
  }
end

local MODULE_PAYLOADS = {
  localPlayer = "localPlayer", cities = "cities", units = "units", visibleMap = "visibleMap",
  selection = "selection", governors = "governors", trade = "trade", cityStates = "cityStates",
  techs = "techs", civics = "civics", government = "government", policies = "government",
  resources = "resources", diplomacyPublic = "diplomacy", economy = "economy"
}

local function mergeCapturedModules(snapshot, unitsScope)
  local playerId, turn = snapshot.localPlayer.localPlayerId, snapshot.session.gameTurn
  if captureCache.playerId ~= playerId or (captureCache.gameTurn and turn < captureCache.gameTurn) then
    captureCache.payloads = {}
    captureCache.moduleStatus = {}
  elseif captureCache.gameTurn ~= turn then
    captureCache.payloads = {}
  end
  captureCache.playerId, captureCache.gameTurn = playerId, turn
  local capturedAt = nowUtc()
  for _, moduleName in ipairs(snapshot.modules) do
    local status = { capturedTurn = turn, capturedAt = snapshot.exportedAt, exportId = snapshot.source.exportId }
    if moduleName == "visibleMap" then status.capturedAt = capturedAt end
    if moduleName == "units" then status.scope = unitsScope or "own-only" end
    captureCache.moduleStatus[moduleName] = status
    local field = MODULE_PAYLOADS[moduleName]
    if field then captureCache.payloads[field] = snapshot[field] end
  end
  snapshot.modules = jsonArray({})
  snapshot.moduleStatus = jsonObject({})
  for moduleName, status in pairs(captureCache.moduleStatus) do
    snapshot.moduleStatus[moduleName] = status
    if status.capturedTurn == turn then
      table.insert(snapshot.modules, moduleName)
      local field = MODULE_PAYLOADS[moduleName]
      if field then snapshot[field] = captureCache.payloads[field] end
    end
  end
  table.sort(snapshot.modules)
  snapshot.exportedAt = capturedAt
  return snapshot
end

local function createSnapshotEmitter(snapshot, triggerKind, json)
  if not base64SelfTestOk() then
    emitDiagnostic("export-blocked-self-test-failed")
    setStatus(lookupText("LOC_CIV6_AI_COPILOT_STATUS_FAILED"))
    return { failed = true }
  end

  triggerKind = triggerKind or "manual"
  json = json or (jsonEncode(snapshot) .. "\n")
  local exportId = snapshot.source.exportId
  local chunkCount = math.ceil(#json / RAW_BYTES_PER_CHUNK)
  local begin = {
    protocolVersion = PROTOCOL_VERSION,
    exportId = exportId,
    schemaVersion = snapshot.schemaVersion,
    chunkCount = chunkCount,
    byteLength = #json,
    encoding = "base64-json",
    createdAt = nowUtc()
  }
  local beginJson = jsonEncode(begin)
  local chunkJsons = {}
  local endJson = jsonEncode({ exportId = exportId })
  local exportDiagnostic = {
    modVersion = MOD_VERSION,
    protocolVersion = PROTOCOL_VERSION,
    reason = "exported",
    exportId = exportId,
    trigger = triggerKind,
    chunkCount = chunkCount,
    byteLength = #json,
    emittedAt = nowUtc()
  }
  local diagnosticJson = jsonEncode(exportDiagnostic)

  return {
    snapshot = snapshot,
    triggerKind = triggerKind,
    json = json,
    begin = begin,
    beginJson = beginJson,
    chunkJsons = chunkJsons,
    endJson = endJson,
    diagnosticJson = diagnosticJson,
    chunkCount = chunkCount,
    chunkIndex = 0,
    beginEmitted = false,
    done = false
  }
end

local function finishSnapshotEmission(emitter)
  local snapshot = emitter.snapshot
  local triggerKind = emitter.triggerKind
  print(SNAPSHOT_END .. " " .. emitter.endJson)
  cacheLatestExport(emitter.begin, emitter.beginJson, emitter.chunkJsons, emitter.endJson, emitter.diagnosticJson)
  emitDiagnostic("exported", {
    exportId = emitter.begin.exportId,
    trigger = triggerKind,
    chunkCount = emitter.chunkCount,
    byteLength = emitter.begin.byteLength,
  })
  local gameTurn = snapshot and snapshot.session and snapshot.session.gameTurn or nil
  if type(gameTurn) == "number" then
    setLastExportStatus(lookupText("LOC_CIV6_AI_COPILOT_LAST_EXPORT_TURN", gameTurn))
  end
  setStatus(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATED"))
  return true
end

local function stepSnapshotEmitter(emitter, maxChunks)
  if emitter == nil or emitter.failed then
    return true, false
  end
  if emitter.done then
    return true, true
  end

  if not emitter.beginEmitted then
    print(SNAPSHOT_BEGIN .. " " .. emitter.beginJson)
    emitter.beginEmitted = true
  end

  local emitted = 0
  while emitter.chunkIndex < emitter.chunkCount and emitted < maxChunks do
    local startIndex = emitter.chunkIndex * RAW_BYTES_PER_CHUNK + 1
    local data = base64Encode(emitter.json:sub(startIndex, startIndex + RAW_BYTES_PER_CHUNK - 1))
    local chunkJson = jsonEncode({
      exportId = emitter.begin.exportId,
      index = emitter.chunkIndex,
      data = data
    })
    table.insert(emitter.chunkJsons, chunkJson)
    print(SNAPSHOT_CHUNK .. " " .. chunkJson)
    emitter.chunkIndex = emitter.chunkIndex + 1
    emitted = emitted + 1
  end

  setSyncProgress(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATING"))

  if emitter.chunkIndex >= emitter.chunkCount then
    emitter.done = true
    return true, finishSnapshotEmission(emitter)
  end
  return false, nil
end

local function emitSnapshot(snapshot, triggerKind)
  mergeCapturedModules(snapshot, "own-only")
  setSyncProgress(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATING"))
  local json = jsonEncode(snapshot) .. "\n"
  local emitter = createSnapshotEmitter(snapshot, triggerKind, json)
  if emitter.failed then
    clearSyncProgress()
    return false
  end
  while true do
    local done, exported = stepSnapshotEmitter(emitter, emitter.chunkCount)
    if done then
      clearSyncProgress()
      return exported
    end
  end
end

local function stopCopilotUpdateIfIdle()
  if copilotUpdateActive and activeSyncJob == nil and pendingAutoSync == nil and ContextPtr and ContextPtr.ClearUpdate then
    ContextPtr:ClearUpdate()
    copilotUpdateActive = false
  end
end

local function startCopilotUpdate()
  if ContextPtr and ContextPtr.SetUpdate and onCopilotUpdate ~= nil then
    ContextPtr:SetUpdate(onCopilotUpdate)
    copilotUpdateActive = true
    return true
  end
  return false
end

local function finishActiveSyncJob(exported)
  local job = activeSyncJob
  activeSyncJob = nil
  clearSyncProgress()
  if job and job.onComplete then
    job.onComplete(exported == true, job)
  end
  stopCopilotUpdateIfIdle()
  return exported == true
end

local function stepActiveSyncJob()
  local job = activeSyncJob
  if job == nil then
    stopCopilotUpdateIfIdle()
    return
  end

  if getLocalPlayerId() ~= job.localPlayerId or Game.GetCurrentGameTurn() ~= job.gameTurn then
    emitDiagnostic("export-aborted-context-changed")
    setStatus(lookupText("LOC_CIV6_AI_COPILOT_STATUS_CONTEXT_CHANGED"))
    finishActiveSyncJob(false)
    return
  end

  if job.phase == "prepare" then
    setSyncProgress(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATING"))
    job.snapshot = collectSnapshot(job.exportType, job.modules, { deferVisibleMap = job.includeVisibleMap })
    if job.includeVisibleMap then
      job.mapCollector = createVisibleMapCollector(job.localPlayerId)
      job.phase = "map"
    else
      job.phase = "encode"
    end
    return
  end

  if job.phase == "map" then
    local done = job.mapCollector:step(VISIBLE_MAP_PLOTS_PER_FRAME)
    setSyncProgress(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATING_MAP"))
    if done then
      local visibleMap, visibleForeignUnits, unverified = job.mapCollector:result()
      job.unitsScope = unverified and "own-only" or "own-and-visible"
      job.snapshot.visibleMap = visibleMap
      if hasModule(job.modules, "units") then
        appendMissingUnits(job.snapshot.units, visibleForeignUnits)
      end
      job.phase = "encode"
    end
    return
  end

  if job.phase == "encode" then
    setSyncProgress(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATING"))
    mergeCapturedModules(job.snapshot, job.unitsScope)
    job.json = jsonEncode(job.snapshot) .. "\n"
    job.phase = "emit"
    return
  end

  if job.phase == "emit" then
    if job.emitter == nil then
      job.emitter = createSnapshotEmitter(job.snapshot, job.triggerKind, job.json)
      if job.emitter.failed then
        finishActiveSyncJob(false)
        return
      end
    end
    local done, exported = stepSnapshotEmitter(job.emitter, SNAPSHOT_CHUNKS_PER_FRAME)
    if done then
      finishActiveSyncJob(exported)
    end
  end
end

local function startSyncJob(exportType, modules, triggerKind, onComplete)
  autoSyncStatus = nil
  if activeSyncJob ~= nil then
    setStatus(lookupText("LOC_CIV6_AI_COPILOT_STATUS_BUSY"))
    return false
  end

  local localPlayerId = getLocalPlayerId()
  if localPlayerId < 0 or not (Players and Players[localPlayerId]) then
    emitDiagnostic("export-blocked-no-local-player")
    setStatus(lookupText("LOC_CIV6_AI_COPILOT_STATUS_NO_LOCAL_PLAYER"))
    return false
  end
  activeSyncJob = {
    exportType = exportType,
    modules = modules,
    triggerKind = triggerKind,
    onComplete = onComplete,
    localPlayerId = localPlayerId,
    gameTurn = Game.GetCurrentGameTurn(),
    includeVisibleMap = hasModule(modules, "visibleMap"),
    phase = "prepare"
  }
  setSyncProgress(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATING"))
  if not startCopilotUpdate() then
    repeat
      stepActiveSyncJob()
    until activeSyncJob == nil
  end
  return true
end

local function syncTurn(triggerKind)
  return startSyncJob("turn", withCoreModules(TURN_BRIEF_MODULES), triggerKind or "manual-turn")
end

local function syncVisibleMap()
  return startSyncJob("visible-map", withCoreModules(MAP_BRIEF_MODULES), "manual-visible-map")
end

local function syncModules(extraModules)
  return startSyncJob("modules", withCoreModules(extraModules), "manual-modules")
end

local function syncCities()
  syncModules({ "cities", "resources" })
end

local function syncUnits()
  syncModules({ "units" })
end

local function syncTechCivics()
  syncModules({ "cities", "techs", "civics", "resources" })
end

local function syncGovernment()
  syncModules({ "government", "policies", "resources" })
end

local function syncResources()
  syncModules({ "resources", "economy" })
end

local function syncDiplomacy()
  syncModules({ "diplomacyPublic" })
end

local function forceFull()
  return startSyncJob("full", withCoreModules(FULL_BRIEF_MODULES), "manual-full")
end

local function autoSyncTurnKey()
  local localPlayerId = getLocalPlayerId()
  local gameTurn = safeCall(function()
    return Game.GetCurrentGameTurn()
  end, 0)
  return tostring(localPlayerId) .. ":" .. tostring(gameTurn), localPlayerId, gameTurn
end

local function isLocalPlayerTurn()
  local localPlayerId = getLocalPlayerId()
  local currentPlayerId = safeCall(function()
    if Game and Game.GetCurrentPlayer then
      return Game.GetCurrentPlayer()
    end
    return localPlayerId
  end, localPlayerId)
  return currentPlayerId == nil or currentPlayerId == localPlayerId
end

local function resetAutoSyncDedupe()
  lastAutoSyncKey = nil
  lastAutoSyncAt = 0
  pendingAutoSync = nil
  if autoSyncEnabled then
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_ON"))
  end
end

local function completePendingAutoSync()
  local pending = pendingAutoSync
  pendingAutoSync = nil
  if pending == nil then
    return false
  end
  if not autoSyncEnabled then
    return false
  end
  if getLocalPlayerId() ~= pending.localPlayerId or Game.GetCurrentGameTurn() ~= pending.gameTurn or not isLocalPlayerTurn() then
    emitDiagnostic("auto-sync-cancelled-context-changed", {
      autoSyncKey = pending.key,
      localPlayerId = pending.localPlayerId,
      gameTurn = pending.gameTurn
    })
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_WAITING"))
    return false
  end
  if lastAutoSyncKey == pending.key then
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_UPDATED"))
    return false
  end

  setSyncProgress(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATING"))
  return startSyncJob("full", withCoreModules(FULL_BRIEF_MODULES), "auto-turn", function(exported)
    if exported then
      lastAutoSyncKey = pending.key
      lastAutoSyncAt = os.time()
      emitDiagnostic("auto-sync-exported", {
        autoSyncKey = pending.key,
        localPlayerId = pending.localPlayerId,
        gameTurn = pending.gameTurn,
        mode = "full"
      })
      setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_STATUS_UPDATED"))
    end
  end)
end

onCopilotUpdate = function()
  if activeSyncJob ~= nil then
    stepActiveSyncJob()
    return
  end

  if pendingAutoSync ~= nil then
    if os.time() < pendingAutoSync.runAt then
      return
    end
    completePendingAutoSync()
    if activeSyncJob == nil and pendingAutoSync == nil then
      stopCopilotUpdateIfIdle()
    end
    return
  end

  stopCopilotUpdateIfIdle()
end

local function tryAutoSyncTurn()
  if not autoSyncEnabled then
    return false
  end

  if not isLocalPlayerTurn() then
    emitDiagnostic("auto-sync-skipped", { skipReason = "not-local-player-turn" })
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_WAITING"))
    return false
  end

  local key, localPlayerId, gameTurn = autoSyncTurnKey()
  if activeSyncJob ~= nil
    and activeSyncJob.triggerKind == "auto-turn"
    and activeSyncJob.localPlayerId == localPlayerId
    and activeSyncJob.gameTurn == gameTurn then
    emitDiagnostic("auto-sync-skipped", {
      skipReason = "already-running",
      autoSyncKey = key,
      localPlayerId = localPlayerId,
      gameTurn = gameTurn
    })
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_PENDING"))
    return false
  end
  if pendingAutoSync ~= nil and pendingAutoSync.key == key then
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_PENDING"))
    return false
  end
  if lastAutoSyncKey == key then
    emitDiagnostic("auto-sync-skipped", {
      skipReason = "duplicate-turn",
      autoSyncKey = key,
      localPlayerId = localPlayerId,
      gameTurn = gameTurn
    })
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_UPDATED"))
    return false
  end

  local now = os.time()
  if lastAutoSyncAt ~= 0 and now - lastAutoSyncAt < AUTO_SYNC_MIN_SECONDS then
    emitDiagnostic("auto-sync-skipped", {
      skipReason = "throttled",
      autoSyncKey = key,
      localPlayerId = localPlayerId,
      gameTurn = gameTurn
    })
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_THROTTLED"))
    return false
  end

  pendingAutoSync = {
    key = key,
    localPlayerId = localPlayerId,
    gameTurn = gameTurn,
    runAt = now + AUTO_SYNC_DELAY_SECONDS
  }
  emitDiagnostic("auto-sync-scheduled", {
    autoSyncKey = key,
    localPlayerId = localPlayerId,
    gameTurn = gameTurn,
    delaySeconds = AUTO_SYNC_DELAY_SECONDS,
    mode = "full"
  })
  setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_PENDING"))
  if not startCopilotUpdate() then
    return completePendingAutoSync()
  end
  return true
end

local function toggleAutoSync()
  autoSyncEnabled = not autoSyncEnabled
  refreshAutoSyncButton()
  if autoSyncEnabled then
    resetAutoSyncDedupe()
    emitDiagnostic("auto-sync-enabled")
  else
    pendingAutoSync = nil
    stopCopilotUpdateIfIdle()
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_OFF"))
    emitDiagnostic("auto-sync-disabled")
  end
end

local function applyPreviewCandidateIcon(instance, candidate)
  if not instance or not instance.CandidateIcon or not candidate then
    return false
  end

  local displaySize = candidate.displaySize or candidate.iconSize or 32
  if displaySize > 40 then
    displaySize = 40
  end
  if instance.CandidateIcon.SetSizeVal then
    instance.CandidateIcon:SetSizeVal(displaySize, displaySize)
  end
  if instance.CandidateIcon.SetOffsetVal then
    instance.CandidateIcon:SetOffsetVal(0, displaySize >= 38 and 1 or 3)
  end

  if candidate.texture then
    instance.CandidateIcon:SetTexture(candidate.texture)
    return true
  end

  if candidate.icon and IconManager and IconManager.FindIconAtlas then
    local iconOffsetX, iconOffsetY, iconTextureSheet = IconManager:FindIconAtlas(candidate.icon, candidate.iconSize or displaySize)
    if iconTextureSheet ~= nil then
      instance.CandidateIcon:SetTexture(iconOffsetX, iconOffsetY, iconTextureSheet)
      return true
    end
  end

  return false
end

local function buildIconPreviewCandidate(rowControl, candidate)
  if not ContextPtr or not ContextPtr.BuildInstanceForControl or not rowControl or not candidate then
    return
  end

  local instance = {}
  ContextPtr:BuildInstanceForControl("Civ6AICopilotIconCandidate", instance, rowControl)
  if instance.CandidateLabel then
    instance.CandidateLabel:SetText(candidate.label or "")
  end
  if instance.CandidateRoot and instance.CandidateRoot.SetToolTipString then
    instance.CandidateRoot:SetToolTipString(candidate.tooltip or candidate.icon or candidate.texture or candidate.label or "")
  end
  if not applyPreviewCandidateIcon(instance, candidate) and instance.CandidateLabel then
    instance.CandidateLabel:SetText((candidate.label or "") .. "?")
  end
end

local function buildIconPreview()
  if iconPreviewBuilt or not Controls then
    return
  end

  for _, group in ipairs(ICON_PREVIEW_CANDIDATE_GROUPS) do
    local rowControl = Controls[group.control]
    if rowControl then
      for _, candidate in ipairs(group.candidates) do
        buildIconPreviewCandidate(rowControl, candidate)
      end
      if rowControl.CalculateSize then
        rowControl:CalculateSize()
      end
    end
  end

  iconPreviewBuilt = true
end

local function hidePanels()
  if Controls.CopilotPanel then
    Controls.CopilotPanel:SetHide(true)
  end
  if Controls.IconPreviewPanel then
    Controls.IconPreviewPanel:SetHide(true)
  end
end

local function showBriefingPanel()
  if Controls.IconPreviewPanel then
    Controls.IconPreviewPanel:SetHide(true)
  end
  if Controls.CopilotPanel then
    Controls.CopilotPanel:SetHide(false)
  end
end

local function showIconPreviewPanel()
  if Controls.CopilotPanel then
    Controls.CopilotPanel:SetHide(true)
  end
  if Controls.IconPreviewPanel then
    Controls.IconPreviewPanel:SetHide(false)
  end
end

local function togglePanel()
  if Controls.IconPreviewPanel and not Controls.IconPreviewPanel:IsHidden() then
    hidePanels()
    return
  end
  if Controls.CopilotPanel:IsHidden() then
    showBriefingPanel()
  else
    hidePanels()
  end
end

local function copilotRegistry()
  if ExposedMembers == nil then
    return nil
  end
  ExposedMembers.Civ6AICopilot = ExposedMembers.Civ6AICopilot or {}
  ExposedMembers.Civ6AICopilot.launchBar = ExposedMembers.Civ6AICopilot.launchBar or {}
  return ExposedMembers.Civ6AICopilot.launchBar
end

local function destroyLaunchInstance(buttonStack, instance)
  if instance == nil then return false end
  return safeCall(function()
    local control = instance.CopilotButton or instance.CopilotPin
    if control == nil or control.SetHide == nil then return false end
    control:SetHide(true)
    return true
  end, false) == true
end

local function detachStaleLaunchButton(buttonStack)
  local registry = copilotRegistry()
  if registry == nil then
    return false
  end

  local removed = false
  if registry.buttonInstance ~= nil then
    removed = destroyLaunchInstance(buttonStack, registry.buttonInstance) or removed
  end
  if registry.pinInstance ~= nil then
    removed = destroyLaunchInstance(buttonStack, registry.pinInstance) or removed
  end
  registry.buttonInstance = nil
  registry.pinInstance = nil
  registry.attachedAt = nil
  if removed then
    emitDiagnostic("launchbar-deduped")
  end
  return removed
end

local function resizeLaunchBar(buttonStack)
  buttonStack:CalculateSize()
  local stackWidth = buttonStack:GetSizeX()
  local backing = ContextPtr:LookUpControl("/InGame/LaunchBar/LaunchBacking")
  if backing then
    backing:SetSizeX(stackWidth + 116)
  end
  local backingTile = ContextPtr:LookUpControl("/InGame/LaunchBar/LaunchBackingTile")
  if backingTile then
    backingTile:SetSizeX(stackWidth - 20)
  end
  local dropShadow = ContextPtr:LookUpControl("/InGame/LaunchBar/LaunchBarDropShadow")
  if dropShadow then
    dropShadow:SetSizeX(stackWidth)
  end
  if LuaEvents and LuaEvents.LaunchBar_Resize then
    LuaEvents.LaunchBar_Resize(stackWidth)
  end
  return stackWidth
end

local function applyCopilotIcon()
  if not launchButtonInstance.CopilotButtonIcon or not IconManager or not IconManager.FindIconAtlas then
    return
  end

  for _, iconName in ipairs(COPILOT_ICON_CANDIDATES) do
    local iconOffsetX, iconOffsetY, iconTextureSheet = IconManager:FindIconAtlas(iconName, COPILOT_ICON_SIZE)
    if iconTextureSheet ~= nil then
      launchButtonInstance.CopilotButtonIcon:SetTexture(iconOffsetX, iconOffsetY, iconTextureSheet)
      return
    end
  end
end

local function attachLaunchButton()
  if launchButtonAttached then
    return
  end
  if not ContextPtr or not ContextPtr.LookUpControl or not ContextPtr.BuildInstanceForControl then
    emitDiagnostic("launchbar-unavailable")
    return
  end

  local buttonStack = ContextPtr:LookUpControl("/InGame/LaunchBar/ButtonStack")
  if buttonStack == nil then
    emitDiagnostic("launchbar-unavailable", { stage = "button-stack-missing" })
    return
  end

  detachStaleLaunchButton(buttonStack)
  launchButtonInstance = {}
  launchPinInstance = {}
  ContextPtr:BuildInstanceForControl("Civ6AICopilotLaunchItem", launchButtonInstance, buttonStack)
  if not launchButtonInstance.CopilotButton then
    emitDiagnostic("launchbar-unavailable", { stage = "copilot-button-instance-missing" })
    return
  end
  applyCopilotIcon()
  launchButtonInstance.CopilotButton:RegisterCallback(Mouse.eLClick, togglePanel)
  ContextPtr:BuildInstanceForControl("Civ6AICopilotLaunchPin", launchPinInstance, buttonStack)
  local registry = copilotRegistry()
  if registry ~= nil then
    registry.buttonInstance = launchButtonInstance
    registry.pinInstance = launchPinInstance
    registry.attachedAt = nowUtc()
  end
  local stackWidth = resizeLaunchBar(buttonStack)
  launchButtonAttached = true
  emitDiagnostic("launchbar-attached", {
    buttonStackPath = "/InGame/LaunchBar/ButtonStack",
    stackWidth = stackWidth,
    hasCopilotButton = true,
    hasLaunchBarResize = LuaEvents ~= nil and LuaEvents.LaunchBar_Resize ~= nil
  })
end

local function registerPanelCallbacks()
  if not Controls then
    return
  end
  Controls.AutoSyncButton:RegisterCallback(Mouse.eLClick, toggleAutoSync)
  Controls.UpdateBriefButton:RegisterCallback(Mouse.eLClick, forceFull)
  Controls.IconPreviewButton:RegisterCallback(Mouse.eLClick, function()
    showIconPreviewPanel()
  end)
  Controls.IconPreviewBackButton:RegisterCallback(Mouse.eLClick, function()
    showBriefingPanel()
  end)
  Controls.CloseButton:RegisterCallback(Mouse.eLClick, function()
    hidePanels()
  end)
end

local function registerAutoSyncEvents()
  if not Events then
    return
  end
  if Events.LocalPlayerTurnBegin then
    Events.LocalPlayerTurnBegin.Add(tryAutoSyncTurn)
  elseif Events.TurnBegin then
    Events.TurnBegin.Add(tryAutoSyncTurn)
  end
  if Events.LocalPlayerChanged then
    Events.LocalPlayerChanged.Add(resetAutoSyncDedupe)
  end
end

local function initialize()
  print("CIV6_AI_COPILOT_LOADED version=" .. MOD_VERSION)
  emitDiagnostic("loaded")
  if decisionDataLoadError ~= nil then
    emitDiagnostic("decision-data-module-unavailable", { stage = decisionDataLoadError })
  end
  if ContextPtr and ContextPtr.SetHide then
    ContextPtr:SetHide(false)
  end
  if Controls and Controls.XmlLoadedLabel then
    Controls.XmlLoadedLabel:SetHide(true)
  end
  registerPanelCallbacks()
  buildIconPreview()
  registerAutoSyncEvents()
  attachLaunchButton()
  if Events and Events.LoadGameViewStateDone then
    Events.LoadGameViewStateDone.Add(attachLaunchButton)
  end
  refreshAutoSyncButton()
  setLastExportStatus(lookupText("LOC_CIV6_AI_COPILOT_LAST_EXPORT_NONE"))
  setStatus(lookupText("LOC_CIV6_AI_COPILOT_STATUS_READY"))
end

initialize()
