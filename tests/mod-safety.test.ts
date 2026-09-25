import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPAT_VERSION, PROTOCOL_VERSION, SCHEMA_VERSION, VERSION } from "../tools/project/src/version.js";

const modInfoPath = path.resolve("mod/civ6-ai-copilot.modinfo");
const modXmlPath = path.resolve("mod/ui/civ6_ai_copilot.xml");
const modLuaPath = path.resolve("mod/ui/civ6_ai_copilot.lua");
const modTextPath = path.resolve("mod/text/civ6-ai-copilot-text.xml");
const modThumbnailPath = path.resolve("mod/thumbnail.png");

function versionPattern(name: string, version: string): RegExp {
  return new RegExp(`local ${name} = "${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
}

test("modinfo registers a passive InGame UI context and required files", async () => {
  const modInfo = await readFile(modInfoPath, "utf8");
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(modInfo, /<AffectsSavedGames>0<\/AffectsSavedGames>/);
  assert.match(modInfo, /<AddUserInterfaces[^>]*id="CIV6_AI_COPILOT_UI"/);
  assert.match(modInfo, /<UpdateText[^>]*id="CIV6_AI_COPILOT_TEXT"/);
  assert.match(modInfo, /<Context>InGame<\/Context>/);
  assert.match(lua, versionPattern("MOD_VERSION", VERSION));
  assert.match(lua, versionPattern("COMPAT_VERSION", COMPAT_VERSION));
  assert.match(lua, versionPattern("SCHEMA_VERSION", SCHEMA_VERSION));
  assert.match(lua, versionPattern("PROTOCOL_VERSION", PROTOCOL_VERSION));
  assert.match(modInfo, /<AddUserInterfaces[^>]*id="CIV6_AI_COPILOT_UI"[\s\S]*?<File>ui\/civ6_ai_copilot\.xml<\/File>[\s\S]*?<\/AddUserInterfaces>/);
  assert.match(modInfo, /<File>ui\/civ6_ai_copilot\.lua<\/File>/);
  assert.match(modInfo, /<File>ui\/civ6_ai_copilot\.xml<\/File>/);
  assert.match(modInfo, /<File>text\/civ6-ai-copilot-text\.xml<\/File>/);
  assert.match(modInfo, /<File>thumbnail\.png<\/File>/);

  await stat(modXmlPath);
  await stat(modLuaPath);
  await stat(modTextPath);
  await stat(modThumbnailPath);
});

test("modinfo injects the Copilot XML directly so Civ6 loads the paired Lua context", async () => {
  const modInfo = await readFile(modInfoPath, "utf8");
  const addUi = modInfo.match(/<AddUserInterfaces[^>]*id="CIV6_AI_COPILOT_UI"[\s\S]*?<\/AddUserInterfaces>/)?.[0] ?? "";
  const importFiles = modInfo.match(/<ImportFiles[^>]*id="CIV6_AI_COPILOT_FILES"[\s\S]*?<\/ImportFiles>/)?.[0] ?? "";

  assert.match(addUi, /<File>ui\/civ6_ai_copilot\.xml<\/File>/);
  assert.doesNotMatch(addUi, /civ6_ai_copilot_loader\.xml/);
  assert.match(importFiles, /<File>ui\/civ6_ai_copilot\.lua<\/File>/);
});

test("mod xml exposes stable Copilot controls used by Lua and skill guidance", async () => {
  const xml = await readFile(modXmlPath, "utf8");
  const text = await readFile(modTextPath, "utf8");

  for (const id of [
    "CopilotButton",
    "CopilotButtonLabel",
    "XmlLoadedLabel",
    "CopilotPanel",
    "StatusLabel",
    "LastExportLabel",
    "AutoSyncButton",
    "UpdateBriefButton",
    "CloseButton"
  ]) {
    assert.match(xml, new RegExp(`ID="${id}"`));
  }

  assert.match(xml, /<Instance\s+Name="Civ6AICopilotLaunchItem"/);
  assert.match(xml, /<Instance\s+Name="Civ6AICopilotLaunchPin"/);
  assert.match(xml, /ID="CopilotButton"[^>]*Anchor="L,C"/);
  assert.match(xml, /ID="CopilotButtonIcon"/);
  assert.doesNotMatch(xml, /ID="CopilotButton"[^>]*Anchor="R,T"/);
  assert.doesNotMatch(xml, /ID="CopilotButton"[^>]*\sOffset="/);
  assert.match(xml, /ID="XmlLoadedLabel"[^>]*Offset="326,82"/);
  assert.match(xml, /ID="CopilotPanel"[^>]*Offset="326,82"/);
  assert.doesNotMatch(xml, /ID="CopilotButtonLabel"[^>]*String="AI"/);
  assert.match(xml, /ID="XmlLoadedLabel"[^>]*String="LOC_CIV6_AI_COPILOT_STATUS_XML_LOADED"/);
  assert.match(xml, /ID="StatusLabel"[^>]*String="LOC_CIV6_AI_COPILOT_STATUS_READY"/);
  assert.match(xml, /<GridButton ID="UpdateBriefButton"[^>]*String="LOC_CIV6_AI_COPILOT_UPDATE_BRIEF"/);
  assert.doesNotMatch(xml, /ID="(?:SyncTurnButton|SyncMapButton|SyncCitiesButton|SyncUnitsButton|SyncTechCivicsButton|SyncGovernmentButton|SyncResourcesButton|SyncDiplomacyButton|ForceFullButton)"/);
  assert.match(xml, /ID="CopilotPanel"[^>]*Size="398,185"/);
  assert.match(xml, /<Stack ID="PanelStack"[^>]*Size="352,115"[^>]*StackGrowth="Down"/);
  assert.match(xml, /<GridButton ID="UpdateBriefButton" Size="352,34"/);
  assert.match(xml, /<Stack ID="PanelActionsRow" Size="352,28" StackGrowth="Right"/);
  assert.match(text, /Tag="LOC_CIV6_AI_COPILOT_UPDATE_BRIEF" Language="en_US"[\s\S]*?<Text>Update Briefing<\/Text>/);
  assert.match(text, /Tag="LOC_CIV6_AI_COPILOT_UPDATE_BRIEF" Language="zh_Hans_CN"[\s\S]*?<Text>更新战情<\/Text>/);
});

test("mod LaunchBar entry uses a real Civ6 icon instead of text-only AI label", async () => {
  const xml = await readFile(modXmlPath, "utf8");
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(xml, /<Button\s+ID="CopilotButton"[^>]*TextureOffset="0,2"/);
  assert.match(xml, /<Image\s+ID="CopilotButtonIcon"[^>]*Size="32,32"/);
  assert.match(xml, /<Label\s+ID="CopilotButtonLabel"[^>]*Hidden="1"/);
  assert.match(xml, /<GridButton\s+ID="IconPreviewButton"[^>]*Hidden="1"[^>]*Size="0,0"/);
  assert.equal(xml.indexOf('ID="IconPreviewButton"') > xml.indexOf('ID="CloseButton"'), true);
  assert.match(lua, /local COPILOT_ICON_CANDIDATES = \{ "ICON_CIVILOPEDIA_CONCEPTS" \}/);
  assert.match(lua, /local COPILOT_ICON_SIZE = 32/);
  assert.match(lua, /IconManager:FindIconAtlas\(iconName,\s*COPILOT_ICON_SIZE\)/);
  assert.match(lua, /launchButtonInstance\.CopilotButtonIcon:SetTexture\(iconOffsetX, iconOffsetY, iconTextureSheet\)/);
});

test("mod LaunchBar entry deduplicates stale buttons across UI context reloads", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function copilotRegistry\(\)/);
  assert.match(lua, /ExposedMembers\.Civ6AICopilot\.launchBar/);
  assert.match(lua, /local function detachStaleLaunchButton\(buttonStack\)/);
  assert.match(lua, /instance\.CopilotButton or instance\.CopilotPin/);
  assert.match(lua, /control:SetHide\(true\)/);
  assert.doesNotMatch(lua, /DestroyChild/);
  assert.match(lua, /emitDiagnostic\("launchbar-deduped"\)/);
  assert.match(lua, /registry\.buttonInstance = launchButtonInstance/);
  assert.match(lua, /registry\.pinInstance = launchPinInstance/);
});

test("mod Lua avoids gameplay mutation APIs and emits the bridge sentinel protocol", async () => {
  const lua = await readFile(modLuaPath, "utf8");
  const bannedPatterns = [
    /UnitManager\.Request/,
    /CityManager\.Request/,
    /PlayerUnits:Create/,
    /PlayerUnits:Destroy/,
    /PlayerCities:Create/,
    /PlayerCities:Destroy/,
    /TerrainBuilder\./,
    /ResourceBuilder\./,
    /ImprovementBuilder\./,
    /RouteBuilder\./,
    /RevealAllPlots/,
    /ChangeVisibilityCount/,
    /DeclareWarOn/,
    /MakePeaceWith/,
    /ChangeCurrentResearchProgress/,
    /SetResearchProgress/,
    /SetResearchingTech/,
    /SetTech/,
    /TriggerBoost/,
    /ReverseBoost/,
    /ChangeCurrentCulturalProgress/,
    /SetCivic/,
    /SetProgressingCivic/,
    /SetCurrentGovernment/,
    /UnlockGovernment/,
    /UnlockPolicy/,
    /RequestChangeGovernment/,
    /RequestPolicy/,
    /RequestPolicyChanges/,
    /RequestOperation/,
    /RequestCommand/
  ];

  for (const pattern of bannedPatterns) {
    assert.equal(pattern.test(lua), false, `banned Civ6 mutation API matched ${pattern}`);
  }

  assert.match(lua, /CIV6_AI_COPILOT_SNAPSHOT_BEGIN/);
  assert.match(lua, /CIV6_AI_COPILOT_SNAPSHOT_CHUNK/);
  assert.match(lua, /CIV6_AI_COPILOT_SNAPSHOT_END/);
  assert.match(lua, /CIV6_AI_COPILOT_DIAGNOSTIC/);
  assert.match(lua, /ExposedMembers\.Civ6AICopilot\.latestExport/);
  assert.match(lua, /beginJson = beginJson/);
  assert.match(lua, /chunkJsons = chunkJsons/);
  assert.match(lua, /diagnosticJson = diagnosticJson/);
  assert.match(lua, /ContextPtr:SetHide\(false\)/);
  assert.match(lua, /Controls\.XmlLoadedLabel:SetHide\(true\)/);
  assert.match(lua, /ContextPtr:LookUpControl\("\/InGame\/LaunchBar\/ButtonStack"\)/);
  assert.match(lua, /ContextPtr:BuildInstanceForControl\("Civ6AICopilotLaunchItem"/);
  assert.match(lua, /CopilotButtonIcon/);
  assert.match(lua, /LuaEvents\.LaunchBar_Resize/);
  assert.match(lua, /emitDiagnostic\("launchbar-attached"/);
  assert.doesNotMatch(lua, /sha256SelfTest/);
  assert.match(lua, /hasUnitsInPlot/);
  assert.match(lua, /hasPlayerResources/);
  assert.match(lua, /hasGameInfoResources/);
  assert.match(lua, /hasPlayerTechs/);
  assert.match(lua, /hasGameInfoTechnologies/);
  assert.match(lua, /hasPlayerCulture/);
  assert.match(lua, /hasGameInfoCivics/);
  assert.match(lua, /hasGameInfoGovernments/);
  assert.match(lua, /hasGameInfoPolicies/);
  assert.match(lua, /hasGameInfoGovernmentSlots/);
  assert.match(lua, /visibilityMode = "player-visible"/);
});

test("mod Lua emits an export completion diagnostic for real-game smoke tests", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /emitDiagnostic\("exported"/);
  assert.match(lua, /cacheLatestExport\(begin, beginJson, chunkJsons, endJson, diagnosticJson\)/);
  assert.match(lua, /chunkCount = chunkCount/);
  assert.match(lua, /byteLength = #json/);
  assert.doesNotMatch(lua, /checksumSha256/);
  assert.doesNotMatch(lua, /setStatus\([^)]*(sha256|chunk|exportId|分块)/);
  assert.doesNotMatch(lua, /setLastExportStatus\([^)]*(sha256|chunk|exportId|分块)/);
});

test("mod Lua emits timezone-aware ISO timestamps for freshness checks", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local offset = os\.date\("%z"\)/);
  assert.match(lua, /return os\.date\("%Y-%m-%dT%H:%M:%S"\) \.\. sign \.\. hours \.\. ":" \.\. minutes/);
});

test("mod Lua supports optional automatic turn sync with local-turn dedupe", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local autoSyncEnabled = false/);
  assert.match(lua, /local lastAutoSyncKey = nil/);
  assert.match(lua, /local AUTO_SYNC_MIN_SECONDS = 2/);
  assert.match(lua, /local AUTO_SYNC_DELAY_SECONDS = 1/);
  assert.match(lua, /local VISIBLE_MAP_PLOTS_PER_FRAME = 96/);
  assert.doesNotMatch(lua, /SNAPSHOT_HASH_BLOCKS_PER_FRAME/);
  assert.match(lua, /local SNAPSHOT_CHUNKS_PER_FRAME = 64/);
  assert.match(lua, /local RAW_BYTES_PER_CHUNK = math\.floor\(CHUNK_SIZE \/ 4\) \* 3/);
  assert.match(lua, /local function toggleAutoSync/);
  assert.match(lua, /local function tryAutoSyncTurn/);
  assert.match(lua, /local function startSyncJob/);
  assert.match(lua, /local function createVisibleMapCollector/);
  assert.doesNotMatch(lua, /createSha256Hasher|stepSha256Hasher/);
  assert.match(lua, /ContextPtr:SetUpdate\(onCopilotUpdate\)/);
  assert.match(lua, /ContextPtr:ClearUpdate\(\)/);
  assert.doesNotMatch(lua, /ContextPtr:SetUpdate\(nil\)/);
  assert.match(lua, /autoSyncTurnKey\(\)/);
  assert.match(lua, /emitDiagnostic\("auto-sync-enabled"/);
  assert.match(lua, /emitDiagnostic\("auto-sync-disabled"/);
  assert.match(lua, /emitDiagnostic\("auto-sync-skipped"/);
  assert.match(lua, /emitDiagnostic\("auto-sync-scheduled"/);
  assert.match(lua, /emitDiagnostic\("auto-sync-exported"/);
  assert.match(lua, /startSyncJob\("turn", withCoreModules\(TURN_BRIEF_MODULES\), triggerKind or "manual-turn"\)/);
  assert.match(lua, /return startSyncJob\("full", withCoreModules\(FULL_BRIEF_MODULES\), "auto-turn", function\(exported\)/);
  assert.match(lua, /skipReason = "already-running"/);
  assert.match(lua, /Events\.LocalPlayerTurnBegin\.Add\(tryAutoSyncTurn\)/);
  assert.match(lua, /Events\.TurnBegin\.Add\(tryAutoSyncTurn\)/);
  assert.match(lua, /Events\.LocalPlayerChanged\.Add\(resetAutoSyncDedupe\)/);
});

test("mod Lua binds auto sync controls and keeps progress visible without cluttering the idle panel", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /Controls\.AutoSyncButton:RegisterCallback\(Mouse\.eLClick, toggleAutoSync\)/);
  assert.match(lua, /Controls\.AutoSyncButton:SetText\(Locale\.Lookup\(autoSyncEnabled and "LOC_CIV6_AI_COPILOT_AUTO_SYNC_ON" or "LOC_CIV6_AI_COPILOT_AUTO_SYNC_OFF"\)\)/);
  assert.match(lua, /Controls\.UpdateBriefButton:RegisterCallback\(Mouse\.eLClick, forceFull\)/);
  assert.match(lua, /return startSyncJob\("full", withCoreModules\(FULL_BRIEF_MODULES\), "manual-full"\)/);
  assert.match(lua, /Controls\.LastExportLabel:SetText/);
  assert.match(lua, /local visibleStatus = syncProgressStatus or autoSyncStatus or currentStatus/);
  assert.match(lua, /local values = \{ \.\.\. \}/);
  assert.match(lua, /Locale\.Lookup\(key, unpackValues\(values\)\)/);
  assert.match(lua, /syncProgressStatus = nil/);
  assert.match(lua, /autoSyncStatus = nil\s+if activeSyncJob ~= nil/);
  assert.match(lua, /Game\.GetCurrentGameTurn\(\) ~= pending\.gameTurn/);
  const xml = await readFile(modXmlPath, "utf8");
  assert.doesNotMatch(xml, /AutoSyncStatusLabel|BridgeHintLabel|SyncProgressLabel|SyncProgressTrack|SelectiveSyncLabel/);
  assert.doesNotMatch(xml, /SelectiveSyncLabel|SelectiveSyncRow|SyncMapButton|SyncCitiesButton|ForceFullButton/);
});

test("mod Lua avoids full base64 conversion before emitting snapshot chunks", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function base64Encode\(data\)/);
  assert.match(lua, /local data = base64Encode\(emitter\.json:sub\(startIndex, startIndex \+ RAW_BYTES_PER_CHUNK - 1\)\)/);
  assert.match(lua, /chunkCount = math\.ceil\(#json \/ RAW_BYTES_PER_CHUNK\)/);
  assert.doesNotMatch(lua, /local encoded = base64Encode\(json\)/);
  assert.doesNotMatch(lua, /encoded = encoded/);
});

test("mod Lua has no transport SHA or arithmetic bit fallback", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.doesNotMatch(lua, /arithmeticBand|arithmeticBxor|arithmeticRshift|arithmeticLshift|bitlib|sha256|localPlayerNameHash/i);
});

test("light turn modules exclude map scanning and fake notifications", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  const turn = lua.match(/local TURN_BRIEF_MODULES = \{([\s\S]*?)\}/)?.[1];
  assert.ok(turn);
  assert.doesNotMatch(turn, /visibleMap|notifications/);
  assert.match(turn, /selection/);
  assert.match(turn, /governors/);
  assert.match(turn, /trade/);
  assert.match(turn, /cityStates/);
  const full = lua.match(/local FULL_BRIEF_MODULES = \{([\s\S]*?)\}/)?.[1];
  assert.ok(full);
  assert.match(full, /visibleMap/);
  assert.doesNotMatch(lua, /"notifications"/);
});

test("mod Lua keeps selective collectors internal while the default panel has one manual update", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  for (const callback of [
    "syncCities",
    "syncUnits",
    "syncTechCivics",
    "syncGovernment",
    "syncResources",
    "syncDiplomacy"
  ]) {
    assert.match(lua, new RegExp(`local function ${callback}`));
  }

  assert.match(lua, /Controls\.UpdateBriefButton:RegisterCallback\(Mouse\.eLClick, forceFull\)/);
  assert.doesNotMatch(lua, /Controls\.Sync(?:Cities|Units|TechCivics|Government|Resources|Diplomacy)Button/);
  assert.match(lua, /startSyncJob\("modules", withCoreModules/);
  assert.match(lua, /"cities", "resources"/);
  assert.match(lua, /"government", "policies", "resources"/);
  assert.match(lua, /"visibleMap", "economy"/);
});

test("mod Lua only reads optional modules when selective sync requested them", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local includeTechs = hasModule\(modules, "techs"\)/);
  assert.match(lua, /local includeCivics = hasModule\(modules, "civics"\)/);
  assert.match(lua, /local includeGovernment = hasModule\(modules, "government"\) or hasModule\(modules, "policies"\)/);
  assert.match(lua, /local includeResources = hasModule\(modules, "resources"\)/);
  assert.match(lua, /local includeDiplomacy = hasModule\(modules, "diplomacyPublic"\)/);
  assert.match(lua, /local includeGovernors = hasModule\(modules, "governors"\)/);
  assert.match(lua, /local includeTrade = hasModule\(modules, "trade"\)/);
  assert.match(lua, /local includeCityStates = hasModule\(modules, "cityStates"\)/);
  assert.match(lua, /selection = collectSelection\(localPlayerId\)/);
  assert.match(lua, /selection = "selection"/);
  assert.match(lua, /governors = includeGovernors and collectDecisionDomain\("governors", localPlayerId\)/);
  assert.match(lua, /trade = includeTrade and collectDecisionDomain\("trade", localPlayerId\)/);
  assert.match(lua, /cityStates = includeCityStates and collectDecisionDomain\("cityStates", localPlayerId\)/);
  assert.match(lua, /techs = includeTechs and collectProgression\("techs", localPlayerId\) or collectEmptyProgression\("UNKNOWN_TECH"\)/);
  assert.match(lua, /civics = includeCivics and collectProgression\("civics", localPlayerId\) or collectEmptyProgression\("UNKNOWN_CIVIC"\)/);
  assert.match(lua, /government = includeGovernment and collectGovernment\(localPlayerId\) or collectEmptyGovernment\(\)/);
  assert.match(lua, /resources = includeResources and collectResources\(localPlayerId\) or collectEmptyResources\(\)/);
  assert.match(lua, /diplomacy = includeDiplomacy and collectDiplomacy\(localPlayerId\) or collectEmptyDiplomacy\(\)/);
});

test("mod Lua exports map visibility scope and truncation metadata", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local VISIBLE_MAP_TILE_LIMIT = 1024/);
  assert.match(lua, /local function createVisibleMapCollector\(localPlayerId\)/);
  assert.match(lua, /self\.revealedTileCount = self\.revealedTileCount \+ 1/);
  assert.match(lua, /if #self\.selectedCoords >= VISIBLE_MAP_TILE_LIMIT then/);
  assert.match(lua, /self\.truncated = self\.revealedTileCount > #self\.selectedCoords/);
  assert.match(lua, /scope = "player-visible-revealed"/);
  assert.match(lua, /tileLimit = VISIBLE_MAP_TILE_LIMIT/);
  assert.match(lua, /revealedTileCount = self\.revealedTileCount/);
  assert.match(lua, /startSyncJob\("visible-map"/);
  assert.match(lua, /"manual-visible-map"/);
});

test("mod Lua attempts to export only currently visible foreign units from visible plots", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function collectUnitsInVisiblePlot/);
  assert.match(lua, /Units\.GetUnitsInPlot\(plot\)/);
  assert.match(lua, /if coord\.visibleNow then/);
  assert.match(lua, /playerVisibility:IsUnitVisible\(unit\)/);
  assert.match(lua, /tile\.unitIds = unitIds/);
  assert.match(lua, /ownerPlayerId ~= localPlayerId/);
  assert.match(lua, /"visible-now"/);
  assert.match(lua, /appendMissingUnits\(units, visibleForeignUnits\)/);
});

test("mod Lua filters visible map resources through local player resource visibility", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function visiblePlotResourceType\(plot, playerResources\)/);
  assert.match(lua, /playerResources:IsResourceVisible\(resourceHash\)/);
  assert.match(lua, /tile\.resourceType = visibleResourceType/);
  assert.doesNotMatch(lua, /resourceType = tostring\(safeCall\(function\(\)\s*return plot and plot:GetResourceType\(\)/);
});

test("mod Lua exports visible map terrain and feature names instead of raw indexes", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function gameInfoTypeNameByIndex\(tableName, typeField, index\)/);
  assert.match(lua, /return gameInfoTypeNameByIndex\("Terrains", "TerrainType", terrainIndex\)/);
  assert.match(lua, /return gameInfoTypeNameByIndex\("Features", "FeatureType", featureIndex\)/);
  assert.match(lua, /tile\.terrainType = terrainType/);
  assert.match(lua, /tile\.featureType = featureType/);
  assert.doesNotMatch(lua, /terrainType = tostring\(safeCall\(function\(\)\s*return plot and plot:GetTerrainType\(\)/);
  assert.doesNotMatch(lua, /featureType = tostring\(safeCall\(function\(\)\s*return plot and plot:GetFeatureType\(\)/);
});

test("mod Lua exports planning fields for map movement and district placement", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function enrichTilePlanningFields\(tile, plot\)/);
  assert.match(lua, /tile\.riverEdges = riverEdges/);
  assert.match(lua, /tile\.cliffEdges = cliffEdges/);
  assert.match(lua, /setOptionalBoolean\(tile, "isFreshWater", plot, "IsFreshWater"\)/);
  assert.match(lua, /setOptionalBoolean\(tile, "isCoastalLand", plot, "IsCoastalLand"\)/);
  assert.match(lua, /setOptionalBoolean\(tile, "isHills", plot, "IsHills"\)/);
  assert.match(lua, /plotIndexedType\(plot, "GetImprovementType", "Improvements", "ImprovementType"\)/);
  assert.match(lua, /plotIndexedType\(plot, "GetRouteType", "Routes", "RouteType"\)/);
  assert.match(lua, /plotIndexedType\(plot, "GetDistrictType", "Districts", "DistrictType"\)/);
  assert.match(lua, /plotYields\(plot\)/);
  assert.match(lua, /enrichTilePlanningFields\(tile, plot\)/);
});

test("mod Lua resolves city production hashes to stable GameInfo identifiers", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function productionNamedType\(productionHash\)/);
  assert.match(lua, /row\.Hash == hashValue/);
  assert.match(lua, /\{ tableName = "Units", typeField = "UnitType" \}/);
  assert.match(lua, /\{ tableName = "Buildings", typeField = "BuildingType" \}/);
  assert.match(lua, /\{ tableName = "Districts", typeField = "DistrictType" \}/);
  assert.match(lua, /\{ tableName = "Projects", typeField = "ProjectType" \}/);
  assert.match(lua, /currentProduction = productionNamedType\(productionType\)/);
  assert.doesNotMatch(lua, /currentProduction = namedType\(tostring\(productionType/);
});

test("mod Lua omits negative city production turn counts when no production is selected", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function nonNegativeIntegerOrNil\(value\)/);
  assert.match(lua, /local turnsUntilComplete = nonNegativeIntegerOrNil\(safeCall\(function\(\)/);
  assert.match(lua, /turnsUntilComplete = turnsUntilComplete/);
  assert.doesNotMatch(lua, /return queue and queue:GetTurnsLeft\(\)\s+end, 0\)/);
});

test("mod Lua marks empty schema objects and arrays explicitly for JSON encoding", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function jsonObject/);
  assert.match(lua, /local function jsonArray/);
  assert.match(lua, /local function collectEmptyProgression/);
  assert.match(lua, /local function collectEmptyGovernment/);
  assert.match(lua, /local function collectEmptyResources/);
  assert.match(lua, /local function collectEmptyDiplomacy/);
  assert.match(lua, /yields = jsonObject\(\{\}\)/);
  assert.match(lua, /policySlots = jsonObject\(\{\}\)/);
  assert.match(lua, /local cities = jsonArray\(\{\}\)/);
  assert.match(lua, /local units = jsonArray\(\{\}\)/);
  assert.match(lua, /tiles = jsonArray\(\{\}\)/);
  assert.match(lua, /completed = jsonArray\(\{\}\)/);
  assert.match(lua, /available = jsonArray\(\{\}\)/);
  assert.match(lua, /policies = jsonArray\(\{\}\)/);
  assert.match(lua, /items = jsonArray\(\{\}\)/);
  assert.match(lua, /metPlayers = jsonArray\(\{\}\)/);
});

test("mod Lua exports local player resource stockpiles without touching gameplay state", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function collectResources\(localPlayerId\)/);
  assert.match(lua, /player:GetResources\(\)/);
  assert.match(lua, /GameInfo\.Resources\(\)/);
  assert.match(lua, /playerResources:GetResourceAmount\(index\)/);
  assert.match(lua, /if amount > 0 then/);
  assert.match(lua, /visibility = "own"/);
  assert.match(lua, /confidence = amountReads > 0 and "confirmed" or "low"/);
});

test("mod Lua exports local player tech and civic progression with read-only APIs", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function collectProgression\(kind, localPlayerId\)/);
  assert.match(lua, /getter = "GetTechs"/);
  assert.match(lua, /getter = "GetCulture"/);
  assert.match(lua, /tableName = "Technologies"/);
  assert.match(lua, /tableName = "Civics"/);
  assert.match(lua, /current = "GetResearchingTech"/);
  assert.match(lua, /current = "GetProgressingCivic"/);
  assert.match(lua, /completed = "HasTech"/);
  assert.match(lua, /completed = "HasCivic"/);
  assert.match(lua, /available = "CanResearch"/);
  assert.match(lua, /available = "CanProgress"/);
  assert.match(lua, /boosted = "HasBoostBeenTriggered"/);
  assert.match(lua, /confidence = reads > 0 and "confirmed" or "low"/);
});

test("mod Lua exports local player government and slotted policies with read-only APIs", async () => {
  const lua = await readFile(modLuaPath, "utf8");

  assert.match(lua, /local function collectGovernment\(localPlayerId\)/);
  assert.match(lua, /componentCall\(player, "GetCulture"\)/);
  assert.match(lua, /GetCurrentGovernment/);
  assert.match(lua, /GameInfo\[tableName\]\[key\]/);
  assert.match(lua, /"Governments"/);
  assert.match(lua, /"GovernmentType"/);
  assert.match(lua, /GetNumPolicySlots/);
  assert.match(lua, /GetSlotType/);
  assert.match(lua, /GetSlotPolicy/);
  assert.match(lua, /"GovernmentSlots"/);
  assert.match(lua, /"Policies"/);
  assert.match(lua, /IsPolicyActive/);
  assert.match(lua, /visibility = "own"/);
  assert.match(lua, /confidence = reads > 0 and "confirmed" or "low"/);
});
