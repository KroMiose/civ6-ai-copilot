-- civ6-ai-copilot passive UI exporter.
-- This file must stay read-only with respect to gameplay state. It only reads UI-visible data and exports chunks.

local MOD_ID = "civ6-ai-copilot"
local MOD_VERSION = "0.1.1"
local COMPAT_VERSION = "0.1"
local SCHEMA_VERSION = "0.1.0"
local PROTOCOL_VERSION = "0.1.0"
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
local SNAPSHOT_HASH_BLOCKS_PER_FRAME = 64
local SNAPSHOT_CHUNKS_PER_FRAME = 4
local RAW_BYTES_PER_CHUNK = math.floor(CHUNK_SIZE / 4) * 3
local PROGRESS_BAR_WIDTH = 336
local TURN_BRIEF_MODULES = {
  "cities", "units", "techs", "civics", "government", "policies", "resources", "diplomacyPublic", "visibleMap"
}
local MAP_BRIEF_MODULES = { "units", "visibleMap", "diplomacyPublic" }
local FULL_BRIEF_MODULES = {
  "meta", "localPlayer", "cities", "units", "techs", "civics", "government", "policies", "resources", "diplomacyPublic", "visibleMap", "notifications"
}

local bitlib = bit32 or bit
local unpackValues = table.unpack or unpack
local jsonKinds = setmetatable({}, { __mode = "k" })
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

local function safeCall(fn, fallback)
  local values = { pcall(fn) }
  if values[1] then
    table.remove(values, 1)
    return unpackValues(values)
  end
  return fallback
end

local function setStatus(message)
  if Controls and Controls.StatusLabel then
    Controls.StatusLabel:SetText(message)
  end
end

local function lookupText(key)
  return safeCall(function()
    return Locale.Lookup(key)
  end, key) or key
end

local function setLastExportStatus(message)
  if Controls and Controls.LastExportLabel then
    Controls.LastExportLabel:SetText(message)
  end
end

local function setAutoSyncStatus(message)
  if Controls and Controls.AutoSyncStatusLabel then
    Controls.AutoSyncStatusLabel:SetText(message)
    Controls.AutoSyncStatusLabel:SetHide(
      message == nil
      or message == ""
      or message == lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_OFF")
      or message == "回合开始后自动汇总"
    )
  end
end

local function refreshAutoSyncButton()
  if Controls and Controls.AutoSyncButton then
    Controls.AutoSyncButton:SetText(Locale.Lookup(autoSyncEnabled and "LOC_CIV6_AI_COPILOT_AUTO_SYNC_ON" or "LOC_CIV6_AI_COPILOT_AUTO_SYNC_OFF"))
  end
end

local function setControlHidden(control, hidden)
  if control and control.SetHide then
    control:SetHide(hidden)
  end
end

local function setSyncProgress(message, done, total)
  if Controls == nil then
    return
  end

  setControlHidden(Controls.SyncProgressLabel, false)
  setControlHidden(Controls.SyncProgressTrack, false)
  if Controls.SyncProgressLabel then
    Controls.SyncProgressLabel:SetText(message or "正在汇总…")
  end

  local width = 1
  if type(done) == "number" and type(total) == "number" and total > 0 then
    local ratio = done / total
    if ratio < 0 then ratio = 0 end
    if ratio > 1 then ratio = 1 end
    width = math.max(1, math.floor(PROGRESS_BAR_WIDTH * ratio))
  end
  if Controls.SyncProgressFill and Controls.SyncProgressFill.SetSizeX then
    Controls.SyncProgressFill:SetSizeX(width)
  end
end

local function clearSyncProgress()
  if Controls == nil then
    return
  end
  setControlHidden(Controls.SyncProgressLabel, true)
  setControlHidden(Controls.SyncProgressTrack, true)
  if Controls.SyncProgressFill and Controls.SyncProgressFill.SetSizeX then
    Controls.SyncProgressFill:SetSizeX(1)
  end
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

local UINT32 = 4294967296

local function uint32(value)
  return value % UINT32
end

local function arithmeticBand(a, b)
  a = uint32(a)
  b = uint32(b)
  local result = 0
  local bitValue = 1
  while a > 0 and b > 0 do
    local aBit = a % 2
    local bBit = b % 2
    if aBit == 1 and bBit == 1 then
      result = result + bitValue
    end
    a = (a - aBit) / 2
    b = (b - bBit) / 2
    bitValue = bitValue * 2
  end
  return result
end

local function arithmeticBor(a, b)
  a = uint32(a)
  b = uint32(b)
  local result = 0
  local bitValue = 1
  while a > 0 or b > 0 do
    local aBit = a % 2
    local bBit = b % 2
    if aBit == 1 or bBit == 1 then
      result = result + bitValue
    end
    a = (a - aBit) / 2
    b = (b - bBit) / 2
    bitValue = bitValue * 2
  end
  return uint32(result)
end

local function arithmeticBxor(a, b)
  a = uint32(a)
  b = uint32(b)
  local result = 0
  local bitValue = 1
  while a > 0 or b > 0 do
    local aBit = a % 2
    local bBit = b % 2
    if aBit ~= bBit then
      result = result + bitValue
    end
    a = (a - aBit) / 2
    b = (b - bBit) / 2
    bitValue = bitValue * 2
  end
  return uint32(result)
end

local function arithmeticRshift(a, b)
  return math.floor(uint32(a) / 2 ^ b)
end

local function arithmeticLshift(a, b)
  return uint32(uint32(a) * 2 ^ b)
end

local function band(a, b)
  if bitlib and bitlib.band then
    return uint32(bitlib.band(a, b))
  end
  return arithmeticBand(a, b)
end

local function bor(a, b)
  if bitlib and bitlib.bor then
    return uint32(bitlib.bor(a, b))
  end
  return arithmeticBor(a, b)
end

local function bxor(a, b, c, d)
  local function bxor2(left, right)
    if bitlib and bitlib.bxor then
      return uint32(bitlib.bxor(left, right))
    end
    return arithmeticBxor(left, right)
  end

  local value = bxor2(a, b)
  if c ~= nil then
    value = bxor2(value, c)
  end
  if d ~= nil then
    value = bxor2(value, d)
  end
  return value
end

local function bnot(a)
  if bitlib and bitlib.bnot then
    return uint32(bitlib.bnot(a))
  end
  return uint32(0xffffffff - uint32(a))
end

local function rshift(a, b)
  if bitlib and bitlib.rshift then
    return uint32(bitlib.rshift(a, b))
  end
  return arithmeticRshift(a, b)
end

local function lshift(a, b)
  if bitlib and bitlib.lshift then
    return uint32(bitlib.lshift(a, b))
  end
  return arithmeticLshift(a, b)
end

local function rrotate(a, b)
  if bitlib and bitlib.rrotate then
    return uint32(bitlib.rrotate(a, b))
  end
  return band(bor(rshift(a, b), lshift(a, 32 - b)), 0xffffffff)
end

local function add32(...)
  local sum = 0
  for _, value in ipairs({ ... }) do
    sum = (sum + value) % 4294967296
  end
  return sum
end

local function wordToHex(value)
  value = uint32(value)
  return string.format(
    "%02x%02x%02x%02x",
    band(rshift(value, 24), 0xff),
    band(rshift(value, 16), 0xff),
    band(rshift(value, 8), 0xff),
    band(value, 0xff)
  )
end

local sha256K = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
}

local function createSha256Hasher(message)
  local messageLength = #message
  local zeroPadding = (56 - ((messageLength + 1) % 64)) % 64
  return {
    message = message,
    messageLength = messageLength,
    zeroPadding = zeroPadding,
    totalBlocks = (messageLength + 1 + zeroPadding + 8) / 64,
    blockIndex = 0,
    h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19,
    done = false,
    digest = nil
  }
end

local function sha256HasherByte(hasher, position)
  if position <= hasher.messageLength then
    return hasher.message:byte(position) or 0
  end
  if position == hasher.messageLength + 1 then
    return 0x80
  end
  if position <= hasher.messageLength + 1 + hasher.zeroPadding then
    return 0
  end

  local bitLength = hasher.messageLength * 8
  local high = math.floor(bitLength / UINT32)
  local low = bitLength % UINT32
  local lengthByteIndex = position - (hasher.messageLength + 1 + hasher.zeroPadding)
  if lengthByteIndex == 1 then return band(rshift(high, 24), 0xff) end
  if lengthByteIndex == 2 then return band(rshift(high, 16), 0xff) end
  if lengthByteIndex == 3 then return band(rshift(high, 8), 0xff) end
  if lengthByteIndex == 4 then return band(high, 0xff) end
  if lengthByteIndex == 5 then return band(rshift(low, 24), 0xff) end
  if lengthByteIndex == 6 then return band(rshift(low, 16), 0xff) end
  if lengthByteIndex == 7 then return band(rshift(low, 8), 0xff) end
  return band(low, 0xff)
end

local function finishSha256Hasher(hasher)
  hasher.done = true
  hasher.digest = wordToHex(hasher.h0)
    .. wordToHex(hasher.h1)
    .. wordToHex(hasher.h2)
    .. wordToHex(hasher.h3)
    .. wordToHex(hasher.h4)
    .. wordToHex(hasher.h5)
    .. wordToHex(hasher.h6)
    .. wordToHex(hasher.h7)
  return hasher.digest
end

local function stepSha256Hasher(hasher, maxBlocks)
  if hasher.done then
    return true, hasher.digest
  end

  local processed = 0
  while hasher.blockIndex < hasher.totalBlocks and processed < maxBlocks do
    local offset = hasher.blockIndex * 64 + 1
    local w = {}
    for i = 0, 15 do
      local j = offset + i * 4
      w[i] = add32(
        sha256HasherByte(hasher, j) * 0x1000000,
        sha256HasherByte(hasher, j + 1) * 0x10000,
        sha256HasherByte(hasher, j + 2) * 0x100,
        sha256HasherByte(hasher, j + 3)
      )
    end
    for i = 16, 63 do
      local s0 = bxor(rrotate(w[i - 15], 7), rrotate(w[i - 15], 18), rshift(w[i - 15], 3))
      local s1 = bxor(rrotate(w[i - 2], 17), rrotate(w[i - 2], 19), rshift(w[i - 2], 10))
      w[i] = add32(w[i - 16], s0, w[i - 7], s1)
    end

    local a, b, c, d, e, f, g, h = hasher.h0, hasher.h1, hasher.h2, hasher.h3, hasher.h4, hasher.h5, hasher.h6, hasher.h7
    for i = 0, 63 do
      local s1 = bxor(rrotate(e, 6), rrotate(e, 11), rrotate(e, 25))
      local ch = bxor(band(e, f), band(bnot(e), g))
      local temp1 = add32(h, s1, ch, sha256K[i + 1], w[i])
      local s0 = bxor(rrotate(a, 2), rrotate(a, 13), rrotate(a, 22))
      local maj = bxor(band(a, b), band(a, c), band(b, c))
      local temp2 = add32(s0, maj)
      h, g, f, e, d, c, b, a = g, f, e, add32(d, temp1), c, b, a, add32(temp1, temp2)
    end

    hasher.h0, hasher.h1, hasher.h2, hasher.h3 = add32(hasher.h0, a), add32(hasher.h1, b), add32(hasher.h2, c), add32(hasher.h3, d)
    hasher.h4, hasher.h5, hasher.h6, hasher.h7 = add32(hasher.h4, e), add32(hasher.h5, f), add32(hasher.h6, g), add32(hasher.h7, h)
    hasher.blockIndex = hasher.blockIndex + 1
    processed = processed + 1
  end

  if hasher.blockIndex >= hasher.totalBlocks then
    return true, finishSha256Hasher(hasher)
  end
  return false, nil
end

local function sha256(message)
  local hasher = createSha256Hasher(message)
  while true do
    local done, digest = stepSha256Hasher(hasher, hasher.totalBlocks)
    if done then
      return digest
    end
  end
end

local function base64SelfTestOk()
  return safeCall(function()
    return base64Encode("abc") == "YWJj"
  end, false)
end

local function sha256SelfTestOk()
  return safeCall(function()
    return sha256("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
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
    hasBitlib = bitlib ~= nil,
    base64SelfTest = base64SelfTestOk(),
    sha256SelfTest = sha256SelfTestOk(),
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
    checksumSha256 = begin.checksumSha256,
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
  if type(productionHash) ~= "number" or productionHash < 0 then
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

local function nonNegativeIntegerOrNil(value)
  if type(value) == "number" and value >= 0 then
    return math.floor(value)
  end
  return nil
end

local function getLocalPlayerId()
  return safeCall(function()
    return Game.GetLocalPlayer()
  end, 0) or 0
end

local function unitSnapshotEntry(unit, ownerPlayerId, visibilityKind, confidenceKind)
  local unitId = safeCall(function()
    return unit:GetID()
  end, 0)
  local unitTypeIndex = safeCall(function()
    return unit:GetType()
  end, nil)
  local unitType = getGameInfoType("Units", unitTypeIndex, "UnitType") or tostring(unitTypeIndex or "UNKNOWN_UNIT")

  return {
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
    end, 0),
    movesRemaining = safeCall(function()
      return unit:GetMovesRemaining()
    end, 0),
    formationClass = tostring(safeCall(function()
      return unit:GetFormationClass()
    end, "UNKNOWN"))
  }
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
    localPlayerNameHash = "sha256:" .. sha256("local-player-" .. tostring(localPlayerId)),
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
    local turnsUntilComplete = nonNegativeIntegerOrNil(safeCall(function()
      local queue = city:GetBuildQueue()
      return queue and queue:GetTurnsLeft()
    end, nil))

    table.insert(cities, {
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
      yields = jsonObject({})
    })
  end
  return cities
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

local function collectUnitsInVisiblePlot(plot, localPlayerId, seenUnitIds)
  local unitIds = jsonArray({})
  local visibleForeignUnits = jsonArray({})
  local plotUnits = safeCall(function()
    if Units and Units.GetUnitsInPlot then
      return Units.GetUnitsInPlot(plot)
    end
    return nil
  end, nil)

  if type(plotUnits) ~= "table" then
    return unitIds, visibleForeignUnits
  end

  for _, unit in pairs(plotUnits) do
    local ownerPlayerId = safeCall(function()
      return unit:GetOwner()
    end, nil)
    if ownerPlayerId ~= nil then
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

  return unitIds, visibleForeignUnits
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

local function plotYields(plot)
  if plot == nil or GameInfo == nil or GameInfo.Yields == nil then
    return nil
  end

  local yields = jsonObject({})
  local hasYield = false
  safeCall(function()
    for row in GameInfo.Yields() do
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

  local resourceAmount = plotOptionalNumber(plot, "GetResourceCount")
  if resourceAmount ~= nil and resourceAmount > 0 then
    tile.resourceAmount = resourceAmount
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

local function visiblePlotResourceType(plot, localPlayerId)
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

  local player = Players and Players[localPlayerId]
  local playerResources = player and safeCall(function()
    return player:GetResources()
  end, nil) or nil
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

local function createVisibleMapCollector(localPlayerId)
  local collector = {
    tiles = jsonArray({}),
    visibleForeignUnits = jsonArray({}),
    seenVisibleForeignUnitIds = {},
    revealedTileCount = 0,
    truncated = false,
    bounds = nil,
    x = 0,
    y = 0,
    done = false
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

  collector.width, collector.height = safeCall(function()
    return Map.GetGridSize()
  end, 0)
  collector.width = collector.width or 0
  collector.height = collector.height or 0

  function collector:result()
    if not self.visibility or not Map or self.width == 0 then
      return {
        source = "lua-api",
        visibility = "player-visible",
        confidence = "low",
        scope = "player-visible-revealed",
        truncated = false,
        tileLimit = VISIBLE_MAP_TILE_LIMIT,
        revealedTileCount = 0,
        tiles = self.tiles
      }, self.visibleForeignUnits
    end

    return {
      source = "lua-api",
      visibility = "player-visible",
      confidence = "confirmed",
      scope = "player-visible-revealed",
      truncated = self.truncated,
      tileLimit = VISIBLE_MAP_TILE_LIMIT,
      revealedTileCount = self.revealedTileCount,
      bounds = self.bounds,
      tiles = self.tiles
    }, self.visibleForeignUnits
  end

  function collector:progress()
    local total = math.max(1, self.width * self.height)
    local done = math.min(total, self.y * self.width + self.x)
    return done, total
  end

  function collector:step(maxPlots)
    if self.done then
      return true
    end
    if not self.visibility or not Map or self.width == 0 then
      self.done = true
      return true
    end

    local processed = 0
    while self.y < self.height and processed < maxPlots do
      local x = self.x
      local y = self.y
      local revealed = safeCall(function()
        return self.visibility:IsRevealed(x, y)
      end, false)
      if revealed then
        self.revealedTileCount = self.revealedTileCount + 1
        if self.bounds == nil then
          self.bounds = { minX = x, maxX = x, minY = y, maxY = y }
        else
          if x < self.bounds.minX then self.bounds.minX = x end
          if x > self.bounds.maxX then self.bounds.maxX = x end
          if y < self.bounds.minY then self.bounds.minY = y end
          if y > self.bounds.maxY then self.bounds.maxY = y end
        end

        if #self.tiles >= VISIBLE_MAP_TILE_LIMIT then
          self.truncated = true
        else
          local visibleNow = safeCall(function()
            return self.visibility:IsVisible(x, y)
          end, false)
          local plot = safeCall(function()
            return Map.GetPlot(x, y)
          end, nil)
          local tile = {
            source = "lua-api",
            visibility = visibleNow and "visible-now" or "revealed",
            confidence = "confirmed",
            x = x,
            y = y,
            revealed = true,
            visibleNow = visibleNow,
            ownerPlayerId = safeCall(function()
              return plot and plot:GetOwner()
            end, nil)
          }
          local terrainType = plotTerrainType(plot)
          if terrainType ~= nil then
            tile.terrainType = terrainType
          end
          local featureType = plotFeatureType(plot)
          if featureType ~= nil then
            tile.featureType = featureType
          end
          local visibleResourceType = visiblePlotResourceType(plot, localPlayerId)
          if visibleResourceType ~= nil then
            tile.resourceType = visibleResourceType
          end
          enrichTilePlanningFields(tile, plot)
          if visibleNow and plot then
            local unitIds, tileVisibleForeignUnits = collectUnitsInVisiblePlot(plot, localPlayerId, self.seenVisibleForeignUnitIds)
            if #unitIds > 0 then
              tile.unitIds = unitIds
            end
            appendMissingUnits(self.visibleForeignUnits, tileVisibleForeignUnits)
          end
          table.insert(self.tiles, tile)
        end
      end

      self.x = self.x + 1
      if self.x >= self.width then
        self.x = 0
        self.y = self.y + 1
      end
      processed = processed + 1
    end

    if self.y >= self.height then
      self.done = true
    end
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

  return {
    source = "lua-api",
    visibility = "own",
    confidence = reads > 0 and "confirmed" or "low",
    current = current,
    completed = completed,
    available = available,
    boosts = boosts
  }
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

  local canChangePolicies = componentCall(culture, "CanChangeGovernment")
  if type(canChangePolicies) ~= "boolean" then
    canChangePolicies = false
  end

  return {
    source = "lua-api",
    visibility = "own",
    confidence = reads > 0 and "confirmed" or "low",
    currentGovernment = currentGovernment,
    policySlots = policySlots,
    policies = policies,
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

local function hasModule(modules, moduleName)
  for _, value in ipairs(modules or {}) do
    if value == moduleName then
      return true
    end
  end
  return false
end

local function withCoreModules(extraModules)
  local modules = jsonArray({ "meta", "localPlayer" })
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

local function collectSnapshot(exportType, modules, options)
  options = options or {}
  local localPlayerId = getLocalPlayerId()
  local gameTurn = safeCall(function()
    return Game.GetCurrentGameTurn()
  end, 0)
  local includeCities = hasModule(modules, "cities")
  local includeUnits = hasModule(modules, "units")
  local includeVisibleMap = hasModule(modules, "visibleMap")
  local includeTechs = hasModule(modules, "techs")
  local includeCivics = hasModule(modules, "civics")
  local includeGovernment = hasModule(modules, "government") or hasModule(modules, "policies")
  local includeResources = hasModule(modules, "resources")
  local includeDiplomacy = hasModule(modules, "diplomacyPublic")
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
      transport = "lua-log",
      visibilityMode = "player-visible",
      exportId = "civ6ai-" .. tostring(gameTurn) .. "-" .. tostring(localPlayerId) .. "-" .. tostring(os.time()),
      exportType = exportType
    },
    session = {
      sessionId = "turn-" .. tostring(gameTurn) .. "-player-" .. tostring(localPlayerId),
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
    cities = includeCities and collectCities(localPlayerId) or jsonArray({}),
    units = units,
    visibleMap = visibleMap,
    techs = includeTechs and collectProgression("techs", localPlayerId) or collectEmptyProgression("UNKNOWN_TECH"),
    civics = includeCivics and collectProgression("civics", localPlayerId) or collectEmptyProgression("UNKNOWN_CIVIC"),
    government = includeGovernment and collectGovernment(localPlayerId) or collectEmptyGovernment(),
    resources = includeResources and collectResources(localPlayerId) or collectEmptyResources(),
    diplomacy = includeDiplomacy and collectDiplomacy(localPlayerId) or collectEmptyDiplomacy(),
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

local function syncTriggerLabel(triggerKind)
  if triggerKind == "manual-turn" then
    return "回合情报"
  end
  if triggerKind == "manual-visible-map" then
    return "地图情报"
  end
  if triggerKind == "manual-modules" then
    return "专题情报"
  end
  if triggerKind == "manual-full" then
    return "完整战情"
  end
  if triggerKind == "auto-turn" then
    return "自动汇总"
  end
  return "战情简报"
end

local function createSnapshotEmitter(snapshot, triggerKind, json, checksumSha256)
  if not base64SelfTestOk() or not sha256SelfTestOk() then
    emitDiagnostic("export-blocked-self-test-failed")
    setStatus("简报汇总失败。")
    setLastExportStatus("最近汇总失败。")
    return { failed = true }
  end

  triggerKind = triggerKind or "manual"
  json = json or (jsonEncode(snapshot) .. "\n")
  checksumSha256 = checksumSha256 or sha256(json)
  local exportId = snapshot.source.exportId
  local chunkCount = math.ceil(#json / RAW_BYTES_PER_CHUNK)
  local begin = {
    protocolVersion = PROTOCOL_VERSION,
    exportId = exportId,
    schemaVersion = snapshot.schemaVersion,
    chunkCount = chunkCount,
    byteLength = #json,
    checksumSha256 = checksumSha256,
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
    checksumSha256 = begin.checksumSha256,
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
    checksumSha256 = emitter.begin.checksumSha256
  })
  local gameTurn = snapshot and snapshot.session and snapshot.session.gameTurn or nil
  local turnText = type(gameTurn) == "number" and (" · 第 " .. tostring(gameTurn) .. " 回合") or ""
  setLastExportStatus(
    "最近汇总：" .. syncTriggerLabel(triggerKind) .. turnText
  )
  setStatus(
    "简报已汇总，可继续由AI副官分析。"
  )
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

  setSyncProgress(
    "正在写入简报 " .. tostring(emitter.chunkIndex) .. "/" .. tostring(emitter.chunkCount),
    emitter.chunkIndex,
    emitter.chunkCount
  )

  if emitter.chunkIndex >= emitter.chunkCount then
    emitter.done = true
    return true, finishSnapshotEmission(emitter)
  end
  return false, nil
end

local function emitSnapshot(snapshot, triggerKind)
  setSyncProgress("正在编码简报…", 0, 1)
  local json = jsonEncode(snapshot) .. "\n"
  setSyncProgress("正在校验简报…", 0, 1)
  local checksumSha256 = sha256(json)
  local emitter = createSnapshotEmitter(snapshot, triggerKind, json, checksumSha256)
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

local function syncJobLabel(triggerKind)
  if triggerKind == "manual-visible-map" then
    return "地图情报"
  end
  if triggerKind == "manual-modules" then
    return "专题情报"
  end
  if triggerKind == "manual-full" then
    return "完整战情"
  end
  if triggerKind == "auto-turn" then
    return "自动汇总"
  end
  return "回合情报"
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

  if job.phase == "prepare" then
    setStatus("正在准备" .. syncJobLabel(job.triggerKind) .. "…")
    setSyncProgress("正在准备…", 0, 1)
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
    local donePlots, totalPlots = job.mapCollector:progress()
    setSyncProgress("正在扫描地图 " .. tostring(donePlots) .. "/" .. tostring(totalPlots), donePlots, totalPlots)
    if done then
      local visibleMap, visibleForeignUnits = job.mapCollector:result()
      job.snapshot.visibleMap = visibleMap
      if hasModule(job.modules, "units") then
        appendMissingUnits(job.snapshot.units, visibleForeignUnits)
      end
      job.phase = "encode"
    end
    return
  end

  if job.phase == "encode" then
    setStatus("正在编码" .. syncJobLabel(job.triggerKind) .. "…")
    setSyncProgress("正在编码简报…", 0, 1)
    job.json = jsonEncode(job.snapshot) .. "\n"
    job.hasher = createSha256Hasher(job.json)
    job.phase = "hash"
    return
  end

  if job.phase == "hash" then
    local done, digest = stepSha256Hasher(job.hasher, SNAPSHOT_HASH_BLOCKS_PER_FRAME)
    setSyncProgress(
      "正在校验简报 " .. tostring(job.hasher.blockIndex) .. "/" .. tostring(job.hasher.totalBlocks),
      job.hasher.blockIndex,
      job.hasher.totalBlocks
    )
    if done then
      job.checksumSha256 = digest
      job.phase = "emit"
    end
    return
  end

  if job.phase == "emit" then
    if job.emitter == nil then
      job.emitter = createSnapshotEmitter(job.snapshot, job.triggerKind, job.json, job.checksumSha256)
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
  if activeSyncJob ~= nil then
    setStatus("已有简报正在汇总，请稍候。")
    setSyncProgress("已有汇总任务正在进行…", 0, 1)
    return false
  end

  local localPlayerId = getLocalPlayerId()
  activeSyncJob = {
    exportType = exportType,
    modules = modules,
    triggerKind = triggerKind,
    onComplete = onComplete,
    localPlayerId = localPlayerId,
    includeVisibleMap = hasModule(modules, "visibleMap"),
    phase = "prepare"
  }
  setStatus("正在排队" .. syncJobLabel(triggerKind) .. "…")
  setSyncProgress("正在排队…", 0, 1)
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
  syncModules({ "resources" })
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
  setAutoSyncStatus(autoSyncEnabled and "回合开始后自动汇总" or lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_OFF"))
end

local function completePendingAutoSync()
  local pending = pendingAutoSync
  pendingAutoSync = nil
  if pending == nil then
    return false
  end
  if not autoSyncEnabled then
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_OFF"))
    return false
  end
  if lastAutoSyncKey == pending.key then
    setAutoSyncStatus("本回合简报已汇总")
    return false
  end

  setAutoSyncStatus("正在自动汇总…")
  return startSyncJob("turn", withCoreModules(TURN_BRIEF_MODULES), "auto-turn", function(exported)
    if exported then
      lastAutoSyncKey = pending.key
      lastAutoSyncAt = os.time()
      emitDiagnostic("auto-sync-exported", {
        autoSyncKey = pending.key,
        localPlayerId = pending.localPlayerId,
        gameTurn = pending.gameTurn,
        mode = "deferred-progress"
      })
      setAutoSyncStatus("已自动汇总第 " .. tostring(pending.gameTurn) .. " 回合简报")
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
    return
  end

  stopCopilotUpdateIfIdle()
end

local function tryAutoSyncTurn()
  if not autoSyncEnabled then
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_OFF"))
    return false
  end

  if not isLocalPlayerTurn() then
    emitDiagnostic("auto-sync-skipped", { skipReason = "not-local-player-turn" })
    setAutoSyncStatus("等待本地玩家回合")
    return false
  end

  local key, localPlayerId, gameTurn = autoSyncTurnKey()
  if pendingAutoSync ~= nil and pendingAutoSync.key == key then
    setAutoSyncStatus("本回合简报已排队")
    return false
  end
  if lastAutoSyncKey == key then
    emitDiagnostic("auto-sync-skipped", {
      skipReason = "duplicate-turn",
      autoSyncKey = key,
      localPlayerId = localPlayerId,
      gameTurn = gameTurn
    })
    setAutoSyncStatus("本回合简报已汇总")
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
    setAutoSyncStatus("汇总间隔过短")
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
    mode = "deferred-progress"
  })
  setAutoSyncStatus("本回合简报已排队")
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
    setStatus("本地玩家回合开始后自动汇总简报。")
    setAutoSyncStatus("回合开始后自动汇总")
    emitDiagnostic("auto-sync-enabled")
  else
    pendingAutoSync = nil
    stopCopilotUpdateIfIdle()
    setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_OFF"))
    setStatus(lookupText("LOC_CIV6_AI_COPILOT_STATUS_READY"))
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
  if buttonStack == nil or instance == nil or buttonStack.DestroyChild == nil then
    return false
  end
  return safeCall(function()
    buttonStack:DestroyChild(instance)
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
  Controls.SyncTurnButton:RegisterCallback(Mouse.eLClick, function()
    syncTurn("manual-turn")
  end)
  Controls.SyncMapButton:RegisterCallback(Mouse.eLClick, function()
    syncVisibleMap()
  end)
  Controls.SyncCitiesButton:RegisterCallback(Mouse.eLClick, function()
    syncCities()
  end)
  Controls.SyncUnitsButton:RegisterCallback(Mouse.eLClick, function()
    syncUnits()
  end)
  Controls.SyncTechCivicsButton:RegisterCallback(Mouse.eLClick, function()
    syncTechCivics()
  end)
  Controls.SyncGovernmentButton:RegisterCallback(Mouse.eLClick, function()
    syncGovernment()
  end)
  Controls.SyncResourcesButton:RegisterCallback(Mouse.eLClick, function()
    syncResources()
  end)
  Controls.SyncDiplomacyButton:RegisterCallback(Mouse.eLClick, function()
    syncDiplomacy()
  end)
  Controls.ForceFullButton:RegisterCallback(Mouse.eLClick, function()
    forceFull()
  end)
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
  setAutoSyncStatus(lookupText("LOC_CIV6_AI_COPILOT_AUTO_SYNC_STATUS_OFF"))
  setLastExportStatus(lookupText("LOC_CIV6_AI_COPILOT_LAST_EXPORT_NONE"))
  if Controls and Controls.BridgeHintLabel then
    Controls.BridgeHintLabel:SetText(lookupText("LOC_CIV6_AI_COPILOT_BRIDGE_HINT_AFTER_SYNC"))
  end
  setStatus(Locale.Lookup("LOC_CIV6_AI_COPILOT_STATUS_READY"))
end

initialize()
