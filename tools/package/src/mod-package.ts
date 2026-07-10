import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  COMPAT_VERSION,
  LOG_MARKER_PREFIX,
  MOD_FOLDER_NAME_FROM_VERSION,
  MOD_GUID,
  MOD_ID,
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
  VERSION,
  WORKSHOP_VERSION
} from "../../project/src/version.js";

export const MOD_FOLDER_NAME = MOD_FOLDER_NAME_FROM_VERSION;
export const MODINFO_FILE = `${MOD_FOLDER_NAME}.modinfo`;
export const PACKAGE_MANIFEST_FILE = `${MOD_FOLDER_NAME}-package-manifest.json`;
export const PACKAGE_CHECKLIST_FILE = `${MOD_FOLDER_NAME}-install-checklist.md`;

export interface ModPackageValidation {
  ok: boolean;
  issues: string[];
  files: string[];
}

export interface InstallModOptions {
  sourceDir: string;
  modsDir: string;
  clean?: boolean;
}

export interface InstallModResult {
  targetDir: string;
  validation: ModPackageValidation;
}

export interface CreatePackageOptions {
  sourceDir: string;
  outputDir: string;
  clean?: boolean;
}

export interface CreatePackageResult {
  packageDir: string;
  validation: ModPackageValidation;
}

export interface PackageManifestFile {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface PackageManifest {
  packageName: string;
  manifestVersion: string;
  modInfoFile: string;
  modId: string;
  modVersion: string;
  modGuid: string;
  workshopVersion: number;
  compatVersion: string;
  installFolderName: string;
  generatedAt: string;
  files: PackageManifestFile[];
}

const requiredFiles = [
  MODINFO_FILE,
  "ui/civ6_ai_copilot.xml",
  "ui/civ6_ai_copilot.lua",
  "text/civ6-ai-copilot-text.xml"
];

const modInfoFilesSectionEntries = [
  "ui/civ6_ai_copilot.xml",
  "ui/civ6_ai_copilot.lua",
  "text/civ6-ai-copilot-text.xml"
];

const allowedInGameActions = new Set(["UpdateText", "AddUserInterfaces", "ImportFiles"]);
const allowedImportFiles = new Set(["ui/civ6_ai_copilot.lua"]);
const luaContextBasenamePattern = /^[A-Za-z][A-Za-z0-9_]*$/;
const gameplayActionTags = [
  "UpdateDatabase",
  "AddGameplayScripts",
  "UpdateIcons",
  "UpdateColors",
  "ReplaceUIScript"
];

export async function validateModSource(sourceDir: string): Promise<ModPackageValidation> {
  const issues: string[] = [];
  const files: string[] = [];

  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(sourceDir, relativePath);
    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        issues.push(`${relativePath} exists but is not a file`);
      } else {
        files.push(relativePath);
      }
    } catch {
      issues.push(`missing required file: ${relativePath}`);
    }
  }
  for (const relativePath of [MODINFO_FILE, "ui/civ6_ai_copilot.xml", "text/civ6-ai-copilot-text.xml"]) {
    await validateXmlWellFormed(sourceDir, relativePath, issues);
  }

  const modInfoPath = path.join(sourceDir, MODINFO_FILE);
  try {
    const modInfo = await readFile(modInfoPath, "utf8");
    const modMeta = parseModInfoMeta(modInfo);
    if (!modMeta.modGuid || !modMeta.workshopVersion) {
      issues.push(`${MODINFO_FILE} is missing Mod id/version attributes`);
    }
    if (modMeta.modGuid && !isGuid(modMeta.modGuid)) {
      issues.push(`${MODINFO_FILE} Mod id must be a stable GUID`);
    }
    if (modMeta.modGuid && modMeta.modGuid !== MOD_GUID) {
      issues.push(`${MODINFO_FILE} Mod id must match project-version.json modGuid ${MOD_GUID}`);
    }
    if (modMeta.workshopVersion && Number.parseInt(modMeta.workshopVersion, 10) !== WORKSHOP_VERSION) {
      issues.push(`${MODINFO_FILE} Mod version attribute must match project-version.json workshopVersion ${WORKSHOP_VERSION}`);
    }
    if (!/<AddUserInterfaces[^>]*id="CIV6_AI_COPILOT_UI"/.test(modInfo)) {
      issues.push(`${MODINFO_FILE} does not register CIV6_AI_COPILOT_UI`);
    }
    if (!/<Context>InGame<\/Context>/.test(modInfo)) {
      issues.push(`${MODINFO_FILE} does not target InGame context`);
    }
    if (!/<AffectsSavedGames>0<\/AffectsSavedGames>/.test(modInfo)) {
      issues.push(`${MODINFO_FILE} must keep AffectsSavedGames=0`);
    }
    if (!/<EnabledByDefault>0<\/EnabledByDefault>/.test(modInfo)) {
      issues.push(`${MODINFO_FILE} must keep EnabledByDefault=0 for explicit player opt-in`);
    }
    if (!/<CompatibleVersions>[^<]*2\.0[^<]*<\/CompatibleVersions>/.test(modInfo)) {
      issues.push(`${MODINFO_FILE} should declare CompatibleVersions including 2.0`);
    }
    if (!/<UpdateText[^>]*id="CIV6_AI_COPILOT_TEXT"/.test(modInfo)) {
      issues.push(`${MODINFO_FILE} does not register CIV6_AI_COPILOT_TEXT`);
    }
    if (!/<File>text\/civ6-ai-copilot-text\.xml<\/File>/.test(modInfo)) {
      issues.push(`${MODINFO_FILE} does not list text/civ6-ai-copilot-text.xml`);
    }
    const declaredFiles = extractFilesSectionEntries(modInfo);
    for (const relativePath of modInfoFilesSectionEntries) {
      if (!declaredFiles.includes(relativePath)) {
        issues.push(`${MODINFO_FILE} Files section must include ${relativePath}`);
      }
    }
    validateActionSurface(modInfo, issues);
    await validateUiContextPairing(sourceDir, modInfo, declaredFiles, issues);
  } catch {
    // Missing file already reported above.
  }

  await validateLuaRuntimeMarkers(sourceDir, issues);

  return {
    ok: issues.length === 0,
    issues,
    files
  };
}

function validateActionSurface(modInfo: string, issues: string[]): void {
  const inGameActions = modInfo.match(/<InGameActions>([\s\S]*?)<\/InGameActions>/)?.[1] ?? "";
  const actionTags = [...inGameActions.matchAll(/<([A-Za-z][A-Za-z0-9]*)\b/g)].map((match) => match[1]);
  for (const tag of actionTags) {
    if (tag === "Properties" || tag === "File" || tag === "Context" || tag === "LoadOrder") {
      continue;
    }
    if (!allowedInGameActions.has(tag)) {
      issues.push(`${MODINFO_FILE} InGameActions contains unsupported action <${tag}> for passive UI exporter`);
    }
  }

  const frontEndActions = /<FrontEndActions>[\s\S]*?<\/FrontEndActions>/.test(modInfo);
  if (frontEndActions) {
    issues.push(`${MODINFO_FILE} must not define FrontEndActions for the passive UI exporter`);
  }

  for (const tag of gameplayActionTags) {
    const pattern = new RegExp(`<${tag}\\b`);
    if (pattern.test(inGameActions)) {
      issues.push(`${MODINFO_FILE} must not use <${tag}> in InGameActions`);
    }
  }

  for (const importFile of extractImportFilesEntries(modInfo)) {
    if (!allowedImportFiles.has(importFile)) {
      issues.push(`${MODINFO_FILE} ImportFiles may only import passive UI runtime files, not ${importFile}`);
    }
  }
}

async function validateUiContextPairing(
  sourceDir: string,
  modInfo: string,
  declaredFiles: string[],
  issues: string[]
): Promise<void> {
  const uiFiles = extractAddUserInterfaceFiles(modInfo);
  const importedFiles = extractImportFilesEntries(modInfo);
  if (uiFiles.length === 0) {
    issues.push(`${MODINFO_FILE} must include at least one AddUserInterfaces File`);
  }

  for (const uiFile of uiFiles) {
    if (!uiFile.endsWith(".xml")) {
      issues.push(`${MODINFO_FILE} AddUserInterfaces file should be an XML UI context: ${uiFile}`);
      continue;
    }
    const uiBasename = path.basename(uiFile, ".xml");
    if (!luaContextBasenamePattern.test(uiBasename)) {
      issues.push(
        `${MODINFO_FILE} AddUserInterfaces file basename must use Lua-safe letters, numbers, and underscores: ${uiFile}`
      );
    }
    if (!declaredFiles.includes(uiFile)) {
      issues.push(`${MODINFO_FILE} Files section must include AddUserInterfaces file ${uiFile}`);
    }

    try {
      const uiXml = await readFile(path.join(sourceDir, uiFile), "utf8");
      validateContextRootName(uiFile, uiXml, uiBasename, issues);
      validateCopilotSmokeUi(uiFile, uiXml, issues);

      const luaContextFile = uiXml.match(/<LuaContext\b[^>]*\bFileName="([^"]+)"/)?.[1];
      if (luaContextFile) {
        issues.push(
          `${uiFile} must be injected directly by AddUserInterfaces; Civ6 did not initialize nested LuaContext loader wrappers in real-game testing`
        );
        const contextBasename = path.basename(luaContextFile);
        if (!luaContextBasenamePattern.test(contextBasename)) {
          issues.push(`${uiFile} LuaContext FileName basename must use Lua-safe letters, numbers, and underscores: ${luaContextFile}`);
        }
      } else {
        const pairedLua = `${uiFile.slice(0, -4)}.lua`;
        if (!declaredFiles.includes(pairedLua)) {
          issues.push(`${MODINFO_FILE} Files section must include paired UI Lua file ${pairedLua}`);
        }
        if (!importedFiles.includes(pairedLua)) {
          issues.push(`${MODINFO_FILE} must import paired UI Lua file ${pairedLua} with ImportFiles so Civ6 runs the AddUserInterfaces script`);
        }
        if (!/\bID="CopilotButton"/.test(uiXml)) {
          issues.push(`${uiFile} must expose CopilotButton for in-game load smoke testing`);
        }
      }
    } catch {
      // Missing files are already reported by the required file and Files-section checks.
    }
  }
}

function validateContextRootName(
  relativePath: string,
  xml: string,
  expectedBasename: string,
  issues: string[]
): void {
  const contextRoot = xml.match(/<Context\b([^>]*)>/);
  if (!contextRoot) {
    issues.push(`${relativePath} must declare a <Context> root`);
    return;
  }

  const contextName = contextRoot[1].match(/\bName="([^"]+)"/)?.[1];
  if (contextName && contextName !== expectedBasename) {
    issues.push(`${relativePath} Context Name must match its Lua-safe basename ${expectedBasename}, or be omitted`);
  }
}

function validateCopilotSmokeUi(relativePath: string, xml: string, issues: string[]): void {
  const copilotButton = findXmlTagById(xml, "CopilotButton");
  if (copilotButton) {
    const anchor = xmlAttribute(copilotButton, "Anchor");
    if (!/<Instance\s+Name="Civ6AICopilotLaunchItem"[\s\S]*?\bID="CopilotButton"/.test(xml)) {
      issues.push(`${relativePath} CopilotButton must be a LaunchBar instance rather than a static map overlay`);
    }
    if (anchor !== "L,C") {
      issues.push(`${relativePath} CopilotButton must use LaunchBar-compatible Anchor="L,C"`);
    }
    if (xmlAttribute(copilotButton, "Offset")) {
      issues.push(`${relativePath} CopilotButton must not use static screen Offset placement`);
    }
    if (!/<Instance\s+Name="Civ6AICopilotLaunchItem"[\s\S]*?\bID="CopilotButtonIcon"/.test(xml)) {
      issues.push(`${relativePath} Copilot LaunchBar instance must expose CopilotButtonIcon so the entry is not text-only`);
    }
    if (/<Instance\s+Name="Civ6AICopilotLaunchItem"[\s\S]*?\bID="CopilotButtonLabel"[^>]*\bString="AI"/.test(xml)) {
      issues.push(`${relativePath} Copilot LaunchBar instance must not use a visible text-only AI label`);
    }
  }
  if (!/<Instance\s+Name="Civ6AICopilotLaunchPin"[\s\S]*?\bTexture="LaunchBar_TrackPip"/.test(xml)) {
    issues.push(`${relativePath} must provide a LaunchBar pin instance next to CopilotButton`);
  }

  const copilotPanel = findXmlTagById(xml, "CopilotPanel");
  if (copilotPanel) {
    const panelAnchor = xmlAttribute(copilotPanel, "Anchor");
    if (panelAnchor !== "L,T") {
      issues.push(`${relativePath} CopilotPanel must open as a left-top panel near the native LaunchBar`);
    }
    const panelOffset = xmlAttribute(copilotPanel, "Offset");
    const panelOffsetX = Number.parseInt(panelOffset?.split(",")[0] ?? "", 10);
    if (!Number.isFinite(panelOffsetX) || panelOffsetX < 320) {
      issues.push(`${relativePath} CopilotPanel must be offset to the right of the left-side tech/civic chooser`);
    }
  }

  const iconPreviewButton = findXmlTagById(xml, "IconPreviewButton");
  if (iconPreviewButton && xmlAttribute(iconPreviewButton, "Hidden") !== "1") {
    issues.push(`${relativePath} IconPreviewButton must stay hidden outside icon review builds`);
  }
  const previewButtonIndex = xml.indexOf('ID="IconPreviewButton"');
  const closeButtonIndex = xml.indexOf('ID="CloseButton"');
  if (previewButtonIndex >= 0 && closeButtonIndex >= 0 && previewButtonIndex < closeButtonIndex) {
    issues.push(`${relativePath} IconPreviewButton must not sit inside PanelStack before CloseButton`);
  }

  const xmlLoadedLabel = findXmlTagById(xml, "XmlLoadedLabel");
  const statusLabel = findXmlTagById(xml, "StatusLabel");
  if (
    !xmlLoadedLabel ||
    xmlAttribute(xmlLoadedLabel, "String") !== "LOC_CIV6_AI_COPILOT_STATUS_XML_LOADED" ||
    xmlAttribute(statusLabel ?? "", "String") !== "LOC_CIV6_AI_COPILOT_STATUS_XML_LOADED"
  ) {
    issues.push(`${relativePath} must expose a visible XML-loaded Lua-pending diagnostic before Lua initializes`);
  }
}

function findXmlTagById(xml: string, id: string): string | undefined {
  const pattern = new RegExp(`<[A-Za-z_][A-Za-z0-9_.:-]*\\b[^>]*\\bID="${escapeRegExp(id)}"[^>]*>`);
  return xml.match(pattern)?.[0];
}

function xmlAttribute(tag: string, attribute: string): string | undefined {
  return tag.match(new RegExp(`\\b${escapeRegExp(attribute)}="([^"]*)"`))?.[1];
}

function parseXmlOffset(offset: string | undefined): { x: number; y: number } | undefined {
  const match = offset?.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/);
  if (!match) {
    return undefined;
  }
  return {
    x: Number.parseInt(match[1], 10),
    y: Number.parseInt(match[2], 10)
  };
}

async function validateLuaRuntimeMarkers(sourceDir: string, issues: string[]): Promise<void> {
  const luaPath = path.join(sourceDir, "ui/civ6_ai_copilot.lua");
  let lua = "";
  try {
    lua = await readFile(luaPath, "utf8");
  } catch {
    return;
  }

  for (const marker of [
    `${LOG_MARKER_PREFIX}_LOADED`,
    `${LOG_MARKER_PREFIX}_DIAGNOSTIC`,
    `${LOG_MARKER_PREFIX}_SNAPSHOT_BEGIN`,
    `${LOG_MARKER_PREFIX}_SNAPSHOT_CHUNK`,
    `${LOG_MARKER_PREFIX}_SNAPSHOT_END`
  ]) {
    if (!lua.includes(marker)) {
      issues.push(`ui/civ6_ai_copilot.lua must emit ${marker}`);
    }
  }

  validateLuaSyntaxSurface(lua, issues);
  validateLuaVersionConstants(lua, issues);
  validateLuaCopilotIcon(lua, issues);
  validateLuaPanelStatusFeedback(lua, issues);
  validateLuaAutoSyncSurface(lua, issues);

  if (
    !/ContextPtr:LookUpControl\("\/InGame\/LaunchBar\/ButtonStack"\)/.test(lua) ||
    !/ContextPtr:BuildInstanceForControl\("Civ6AICopilotLaunchItem"/.test(lua) ||
    !/CopilotButton:RegisterCallback/.test(lua)
  ) {
    issues.push("ui/civ6_ai_copilot.lua must attach CopilotButton to /InGame/LaunchBar/ButtonStack");
  }
  if (!/emitDiagnostic\("launchbar-attached"/.test(lua)) {
    issues.push("ui/civ6_ai_copilot.lua must emit launchbar-attached after the CopilotButton is mounted");
  }
  if (!/LuaEvents\.LaunchBar_Resize/.test(lua)) {
    issues.push("ui/civ6_ai_copilot.lua must resize the native LaunchBar after adding CopilotButton");
  }
  if (!/ContextPtr:SetHide\(false\)/.test(lua)) {
    issues.push("ui/civ6_ai_copilot.lua must explicitly show the AddUserInterfaces context with ContextPtr:SetHide(false)");
  }

  await validateLuaControlBindings(sourceDir, lua, issues);
  validateLuaSelectiveSyncGuards(lua, issues);
}

function validateLuaCopilotIcon(lua: string, issues: string[]): void {
  const oldHeadIconName = ["AD", "VISOR_GENERIC"].join("");
  if (lua.includes(oldHeadIconName) || /COPILOT_GENERIC/.test(lua)) {
    issues.push("ui/civ6_ai_copilot.lua must not use the old generic head icon");
  }
  if (!/local COPILOT_ICON_CANDIDATES = \{\s*"ICON_CIVILOPEDIA_CONCEPTS"\s*\}/.test(lua)) {
    issues.push("ui/civ6_ai_copilot.lua must use ICON_CIVILOPEDIA_CONCEPTS for the LaunchBar briefing entry");
  }
}

function validateLuaAutoSyncSurface(lua: string, issues: string[]): void {
  const requiredPatterns = [
    /local autoSyncEnabled = false/,
    /local function tryAutoSyncTurn/,
    /local function toggleAutoSync/,
    /local function startSyncJob/,
    /local function createVisibleMapCollector/,
    /local SNAPSHOT_HASH_BLOCKS_PER_FRAME = 64/,
    /local RAW_BYTES_PER_CHUNK = math\.floor\(CHUNK_SIZE \/ 4\) \* 3/,
    /local function createSha256Hasher/,
    /local function stepSha256Hasher/,
    /Controls\.AutoSyncButton:RegisterCallback\(Mouse\.eLClick, toggleAutoSync\)/,
    /Events\.LocalPlayerTurnBegin\.Add\(tryAutoSyncTurn\)/,
    /startSyncJob\("turn", withCoreModules\(TURN_BRIEF_MODULES\), "auto-turn"/,
    /ContextPtr:SetUpdate\(onCopilotUpdate\)/,
    /ContextPtr:ClearUpdate\(\)/,
    /emitDiagnostic\("auto-sync-enabled"/,
    /emitDiagnostic\("auto-sync-disabled"/,
    /emitDiagnostic\("auto-sync-skipped"/,
    /emitDiagnostic\("auto-sync-scheduled"/,
    /emitDiagnostic\("auto-sync-exported"/
  ];

  if (!requiredPatterns.every((pattern) => pattern.test(lua))) {
    issues.push("ui/civ6_ai_copilot.lua must support optional auto turn sync diagnostics without bypassing syncTurn");
  }

  if (/local encoded = base64Encode\(json\)/.test(lua)) {
    issues.push("ui/civ6_ai_copilot.lua must not base64-encode the whole snapshot before chunk emission");
  }
}

function validateLuaVersionConstants(lua: string, issues: string[]): void {
  const expectedConstants = {
    MOD_ID,
    MOD_VERSION: VERSION,
    COMPAT_VERSION,
    SCHEMA_VERSION,
    PROTOCOL_VERSION
  };

  for (const [name, expected] of Object.entries(expectedConstants)) {
    const actual = lua.match(new RegExp(`local\\s+${name}\\s*=\\s*"([^"]+)"`))?.[1];
    if (actual !== expected) {
      issues.push(`ui/civ6_ai_copilot.lua ${name} must be ${expected} from project-version.json`);
    }
  }
}

function validateLuaSyntaxSurface(lua: string, issues: string[]): void {
  const masked = maskLuaCommentsAndStrings(lua, issues);
  const delimiterIssue = findLuaDelimiterIssue(masked);
  if (delimiterIssue) {
    issues.push(`ui/civ6_ai_copilot.lua has a Lua delimiter mismatch: ${delimiterIssue}`);
  }

  const blockIssue = findLuaBlockIssue(masked);
  if (blockIssue) {
    issues.push(`ui/civ6_ai_copilot.lua has a Lua block mismatch: ${blockIssue}`);
  }
}

function maskLuaCommentsAndStrings(lua: string, issues: string[]): string {
  const chars = [...lua];
  let index = 0;

  while (index < chars.length) {
    if (chars[index] === "-" && chars[index + 1] === "-") {
      const longBracket = readLongBracketOpen(chars, index + 2);
      if (longBracket) {
        const close = findLongBracketClose(chars, longBracket.contentStart, longBracket.equalsCount);
        if (close === -1) {
          issues.push(`ui/civ6_ai_copilot.lua has an unclosed Lua block comment at offset ${index}`);
          maskRange(chars, index, chars.length);
          return chars.join("");
        }
        maskRange(chars, index, close);
        index = close;
        continue;
      }

      const lineEnd = findLineEnd(chars, index + 2);
      maskRange(chars, index, lineEnd);
      index = lineEnd;
      continue;
    }

    if (chars[index] === "\"" || chars[index] === "'") {
      const quote = chars[index];
      let cursor = index + 1;
      let closed = false;
      while (cursor < chars.length) {
        if (chars[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (chars[cursor] === quote) {
          closed = true;
          cursor += 1;
          break;
        }
        if (chars[cursor] === "\n" || chars[cursor] === "\r") {
          break;
        }
        cursor += 1;
      }
      if (!closed) {
        issues.push(`ui/civ6_ai_copilot.lua has an unclosed Lua string at offset ${index}`);
        maskRange(chars, index, cursor);
        index = cursor;
        continue;
      }
      maskRange(chars, index, cursor);
      index = cursor;
      continue;
    }

    if (chars[index] === "[") {
      const longBracket = readLongBracketOpen(chars, index);
      if (longBracket) {
        const close = findLongBracketClose(chars, longBracket.contentStart, longBracket.equalsCount);
        if (close === -1) {
          issues.push(`ui/civ6_ai_copilot.lua has an unclosed Lua long string at offset ${index}`);
          maskRange(chars, index, chars.length);
          return chars.join("");
        }
        maskRange(chars, index, close);
        index = close;
        continue;
      }
    }

    index += 1;
  }

  return chars.join("");
}

function readLongBracketOpen(chars: string[], index: number): { equalsCount: number; contentStart: number } | undefined {
  if (chars[index] !== "[") {
    return undefined;
  }
  let cursor = index + 1;
  while (chars[cursor] === "=") {
    cursor += 1;
  }
  if (chars[cursor] !== "[") {
    return undefined;
  }
  return {
    equalsCount: cursor - index - 1,
    contentStart: cursor + 1
  };
}

function findLongBracketClose(chars: string[], start: number, equalsCount: number): number {
  for (let cursor = start; cursor < chars.length; cursor += 1) {
    if (chars[cursor] !== "]") {
      continue;
    }
    let end = cursor + 1;
    let equalsSeen = 0;
    while (equalsSeen < equalsCount && chars[end] === "=") {
      equalsSeen += 1;
      end += 1;
    }
    if (equalsSeen === equalsCount && chars[end] === "]") {
      return end + 1;
    }
  }
  return -1;
}

function findLineEnd(chars: string[], start: number): number {
  let cursor = start;
  while (cursor < chars.length && chars[cursor] !== "\n" && chars[cursor] !== "\r") {
    cursor += 1;
  }
  return cursor;
}

function maskRange(chars: string[], start: number, end: number): void {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (chars[cursor] !== "\n" && chars[cursor] !== "\r") {
      chars[cursor] = " ";
    }
  }
}

function findLuaDelimiterIssue(lua: string): string | undefined {
  const stack: Array<{ char: string; offset: number }> = [];
  const pairs: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{"
  };

  for (let index = 0; index < lua.length; index += 1) {
    const char = lua[index];
    if (char === "(" || char === "[" || char === "{") {
      stack.push({ char, offset: index });
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      const expected = pairs[char];
      const top = stack.pop();
      if (!top) {
        return `closing ${char} at offset ${index} has no opening delimiter`;
      }
      if (top.char !== expected) {
        return `closing ${char} at offset ${index} does not match ${top.char} opened at offset ${top.offset}`;
      }
    }
  }

  const unclosed = stack.at(-1);
  return unclosed ? `unclosed ${unclosed.char} opened at offset ${unclosed.offset}` : undefined;
}

function findLuaBlockIssue(lua: string): string | undefined {
  const stack: Array<{ kind: "function" | "if" | "do" | "repeat" | "pending-if" | "pending-loop"; offset: number }> = [];
  let skipNextThen = false;

  for (const token of tokenizeLuaIdentifiers(lua)) {
    switch (token.value) {
      case "function":
        stack.push({ kind: "function", offset: token.offset });
        break;
      case "if":
        stack.push({ kind: "pending-if", offset: token.offset });
        break;
      case "then": {
        if (skipNextThen) {
          skipNextThen = false;
          break;
        }
        const top = stack.at(-1);
        if (!top || top.kind !== "pending-if") {
          return `then at offset ${token.offset} has no matching if`;
        }
        top.kind = "if";
        break;
      }
      case "for":
      case "while":
        stack.push({ kind: "pending-loop", offset: token.offset });
        break;
      case "do": {
        const top = stack.at(-1);
        if (top?.kind === "pending-loop") {
          top.kind = "do";
        } else {
          stack.push({ kind: "do", offset: token.offset });
        }
        break;
      }
      case "repeat":
        stack.push({ kind: "repeat", offset: token.offset });
        break;
      case "elseif": {
        const top = stack.at(-1);
        if (!top || top.kind !== "if") {
          return `elseif at offset ${token.offset} has no open if block`;
        }
        skipNextThen = true;
        break;
      }
      case "else": {
        const top = stack.at(-1);
        if (!top || top.kind !== "if") {
          return `else at offset ${token.offset} has no open if block`;
        }
        break;
      }
      case "end": {
        const top = stack.pop();
        if (!top) {
          return `end at offset ${token.offset} has no open block`;
        }
        if (top.kind === "repeat") {
          return `end at offset ${token.offset} closes repeat opened at offset ${top.offset}; expected until`;
        }
        if (top.kind === "pending-if") {
          return `if at offset ${top.offset} is missing then before end at offset ${token.offset}`;
        }
        if (top.kind === "pending-loop") {
          return `loop at offset ${top.offset} is missing do before end at offset ${token.offset}`;
        }
        break;
      }
      case "until": {
        const top = stack.pop();
        if (!top || top.kind !== "repeat") {
          return `until at offset ${token.offset} has no matching repeat`;
        }
        break;
      }
    }
  }

  const unclosed = stack.at(-1);
  if (!unclosed) {
    return undefined;
  }
  if (unclosed.kind === "pending-if") {
    return `if opened at offset ${unclosed.offset} is missing then`;
  }
  if (unclosed.kind === "pending-loop") {
    return `loop opened at offset ${unclosed.offset} is missing do`;
  }
  return `${unclosed.kind} opened at offset ${unclosed.offset} is not closed`;
}

function tokenizeLuaIdentifiers(lua: string): Array<{ value: string; offset: number }> {
  const tokens: Array<{ value: string; offset: number }> = [];
  const pattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  for (const match of lua.matchAll(pattern)) {
    tokens.push({
      value: match[0],
      offset: match.index ?? 0
    });
  }
  return tokens;
}

function validateLuaSelectiveSyncGuards(lua: string, issues: string[]): void {
  const requiredPatterns = [
    {
      pattern: /local includeTechs = hasModule\(modules, "techs"\)/,
      issue: "ui/civ6_ai_copilot.lua must guard tech collection behind modules.techs"
    },
    {
      pattern: /local includeCivics = hasModule\(modules, "civics"\)/,
      issue: "ui/civ6_ai_copilot.lua must guard civic collection behind modules.civics"
    },
    {
      pattern: /local includeGovernment = hasModule\(modules, "government"\) or hasModule\(modules, "policies"\)/,
      issue: "ui/civ6_ai_copilot.lua must guard government/policy collection behind modules.government or modules.policies"
    },
    {
      pattern: /local includeResources = hasModule\(modules, "resources"\)/,
      issue: "ui/civ6_ai_copilot.lua must guard resource collection behind modules.resources"
    },
    {
      pattern: /local includeDiplomacy = hasModule\(modules, "diplomacyPublic"\)/,
      issue: "ui/civ6_ai_copilot.lua must guard public diplomacy collection behind modules.diplomacyPublic"
    },
    {
      pattern: /techs = includeTechs and collectProgression\("techs", localPlayerId\) or collectEmptyProgression\("UNKNOWN_TECH"\)/,
      issue: "ui/civ6_ai_copilot.lua must emit an empty low-confidence tech placeholder when techs were not requested"
    },
    {
      pattern: /civics = includeCivics and collectProgression\("civics", localPlayerId\) or collectEmptyProgression\("UNKNOWN_CIVIC"\)/,
      issue: "ui/civ6_ai_copilot.lua must emit an empty low-confidence civic placeholder when civics were not requested"
    },
    {
      pattern: /government = includeGovernment and collectGovernment\(localPlayerId\) or collectEmptyGovernment\(\)/,
      issue: "ui/civ6_ai_copilot.lua must emit an empty low-confidence government placeholder when government/policies were not requested"
    },
    {
      pattern: /resources = includeResources and collectResources\(localPlayerId\) or collectEmptyResources\(\)/,
      issue: "ui/civ6_ai_copilot.lua must emit an empty low-confidence resources placeholder when resources were not requested"
    },
    {
      pattern: /diplomacy = includeDiplomacy and collectDiplomacy\(localPlayerId\) or collectEmptyDiplomacy\(\)/,
      issue: "ui/civ6_ai_copilot.lua must emit an empty low-confidence diplomacy placeholder when public diplomacy was not requested"
    }
  ];

  for (const { pattern, issue } of requiredPatterns) {
    if (!pattern.test(lua)) {
      issues.push(issue);
    }
  }
}

function validateLuaPanelStatusFeedback(lua: string, issues: string[]): void {
  const statusRequirements = [
    {
      pattern: /checksumSha256 = begin\.checksumSha256/,
      issue: "ui/civ6_ai_copilot.lua must keep transport checksum in diagnostics even when hidden from the player panel"
    }
  ];

  for (const { pattern, issue } of statusRequirements) {
    if (!pattern.test(lua)) {
      issues.push(issue);
    }
  }
}

async function validateLuaControlBindings(sourceDir: string, lua: string, issues: string[]): Promise<void> {
  const uiPath = path.join(sourceDir, "ui/civ6_ai_copilot.xml");
  let uiXml = "";
  try {
    uiXml = await readFile(uiPath, "utf8");
  } catch {
    return;
  }

  const xmlControlIds = new Set([...uiXml.matchAll(/\bID="([^"]+)"/g)].map((match) => match[1]));
  const luaControlIds = [...new Set([...lua.matchAll(/\bControls\.([A-Za-z_][A-Za-z0-9_]*)\b/g)].map((match) => match[1]))];

  for (const controlId of luaControlIds) {
    if (!xmlControlIds.has(controlId)) {
      issues.push(`ui/civ6_ai_copilot.lua references Controls.${controlId}, but ui/civ6_ai_copilot.xml has no matching ID`);
    }
  }
}

async function validateXmlWellFormed(sourceDir: string, relativePath: string, issues: string[]): Promise<void> {
  let xml = "";
  try {
    xml = await readFile(path.join(sourceDir, relativePath), "utf8");
  } catch {
    return;
  }

  const issue = findXmlWellFormednessIssue(xml);
  if (issue) {
    issues.push(`${relativePath} is not well-formed XML: ${issue}`);
  }
}

function findXmlWellFormednessIssue(xml: string): string | undefined {
  const stack: string[] = [];
  let index = 0;

  while (index < xml.length) {
    const tagStart = xml.indexOf("<", index);
    if (tagStart === -1) {
      break;
    }

    if (xml.startsWith("<!--", tagStart)) {
      const commentEnd = xml.indexOf("-->", tagStart + 4);
      if (commentEnd === -1) {
        return `comment starting at offset ${tagStart} is not closed`;
      }
      index = commentEnd + 3;
      continue;
    }

    if (xml.startsWith("<![CDATA[", tagStart)) {
      const cdataEnd = xml.indexOf("]]>", tagStart + 9);
      if (cdataEnd === -1) {
        return `CDATA starting at offset ${tagStart} is not closed`;
      }
      index = cdataEnd + 3;
      continue;
    }

    if (xml.startsWith("<?", tagStart)) {
      const instructionEnd = xml.indexOf("?>", tagStart + 2);
      if (instructionEnd === -1) {
        return `processing instruction starting at offset ${tagStart} is not closed`;
      }
      index = instructionEnd + 2;
      continue;
    }

    if (xml.startsWith("<!", tagStart)) {
      const declarationEnd = findXmlTagEnd(xml, tagStart + 2);
      if (declarationEnd === -1) {
        return `declaration starting at offset ${tagStart} is not closed`;
      }
      index = declarationEnd + 1;
      continue;
    }

    const tagEnd = findXmlTagEnd(xml, tagStart + 1);
    if (tagEnd === -1) {
      return `tag starting at offset ${tagStart} is not closed`;
    }

    const rawTag = xml.slice(tagStart + 1, tagEnd).trim();
    if (rawTag.length === 0) {
      return `empty tag at offset ${tagStart}`;
    }

    if (rawTag.startsWith("/")) {
      const closingName = rawTag.slice(1).trim().match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/)?.[1];
      if (!closingName) {
        return `invalid closing tag at offset ${tagStart}`;
      }
      const openingName = stack.pop();
      if (openingName !== closingName) {
        return openingName
          ? `closing </${closingName}> does not match <${openingName}>`
          : `closing </${closingName}> has no opening tag`;
      }
    } else {
      const openingName = rawTag.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/)?.[1];
      if (!openingName) {
        return `invalid opening tag at offset ${tagStart}`;
      }
      if (!/\/\s*$/.test(rawTag)) {
        stack.push(openingName);
      }
    }

    index = tagEnd + 1;
  }

  const unclosed = stack.at(-1);
  if (unclosed) {
    return `unclosed <${unclosed}>`;
  }
  return undefined;
}

function findXmlTagEnd(xml: string, startIndex: number): number {
  let quote: string | undefined;
  for (let index = startIndex; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") {
      return index;
    }
  }
  return -1;
}

function extractFilesSectionEntries(modInfo: string): string[] {
  const filesSection = modInfo.match(/<Files>([\s\S]*?)<\/Files>/)?.[1] ?? "";
  return [...filesSection.matchAll(/<File>([^<]+)<\/File>/g)].map((match) => match[1]);
}

function extractAddUserInterfaceFiles(modInfo: string): string[] {
  const addUiSections = [...modInfo.matchAll(/<AddUserInterfaces\b[^>]*>([\s\S]*?)<\/AddUserInterfaces>/g)].map((match) => match[1]);
  return addUiSections.flatMap((section) => [...section.matchAll(/<File>([^<]+)<\/File>/g)].map((match) => match[1]));
}

function extractImportFilesEntries(modInfo: string): string[] {
  const importSections = [...modInfo.matchAll(/<ImportFiles\b[^>]*>([\s\S]*?)<\/ImportFiles>/g)].map((match) => match[1]);
  return importSections.flatMap((section) => [...section.matchAll(/<File>([^<]+)<\/File>/g)].map((match) => match[1]));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function installMod(options: InstallModOptions): Promise<InstallModResult> {
  const validation = await validateModSource(options.sourceDir);
  if (!validation.ok) {
    return { targetDir: path.join(options.modsDir, MOD_FOLDER_NAME), validation };
  }

  const targetDir = path.join(options.modsDir, MOD_FOLDER_NAME);
  if (options.clean) {
    await rm(targetDir, { recursive: true, force: true });
  }
  await mkdir(options.modsDir, { recursive: true });
  await cp(options.sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
  });

  return {
    targetDir,
    validation: await validateInstalledMod(targetDir)
  };
}

export async function createPackageDirectory(options: CreatePackageOptions): Promise<CreatePackageResult> {
  const packageDir = path.join(options.outputDir, MOD_FOLDER_NAME);
  const validation = await validateModSource(options.sourceDir);
  if (!validation.ok) {
    return { packageDir, validation };
  }

  if (options.clean) {
    await rm(packageDir, { recursive: true, force: true });
  }
  await mkdir(options.outputDir, { recursive: true });
  await cp(options.sourceDir, packageDir, {
    recursive: true,
    force: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
  });
  await writePackageChecklist(packageDir);
  await writeManifest(packageDir);

  return {
    packageDir,
    validation: await validateInstalledMod(packageDir)
  };
}

export async function validateInstalledMod(targetDir: string): Promise<ModPackageValidation> {
  const validation = await validateModSource(targetDir);
  if (path.basename(targetDir) !== MOD_FOLDER_NAME) {
    validation.issues.push(`installed mod folder should be named ${MOD_FOLDER_NAME}`);
  }
  await validatePackageManifestIfPresent(targetDir, validation.issues);
  validation.ok = validation.issues.length === 0;
  return validation;
}

export function defaultCiv6ModsDir(platform = os.platform(), homeDir = os.homedir()): string {
  if (platform === "win32") {
    return path.win32.join(homeDir, "Documents", "My Games", "Sid Meier's Civilization VI", "Mods");
  }
  if (platform === "darwin") {
    return path.posix.join(
      homeDir,
      "Library",
      "Application Support",
      "Sid Meier's Civilization VI",
      "Sid Meier's Civilization VI",
      "Mods"
    );
  }
  return path.posix.join(homeDir, ".local", "share", "Aspyr", "Sid Meier's Civilization VI", "Mods");
}

async function writeManifest(packageDir: string): Promise<void> {
  const modInfo = await readFile(path.join(packageDir, MODINFO_FILE), "utf8");
  const files = await buildManifestFiles(packageDir);
  const modMeta = parseModInfoMeta(modInfo);
  const manifest: PackageManifest = {
    packageName: MOD_FOLDER_NAME,
    manifestVersion: VERSION,
    modInfoFile: MODINFO_FILE,
    modId: MOD_ID,
    modVersion: VERSION,
    modGuid: modMeta.modGuid,
    workshopVersion: Number.parseInt(modMeta.workshopVersion, 10),
    compatVersion: COMPAT_VERSION,
    installFolderName: MOD_FOLDER_NAME,
    generatedAt: new Date().toISOString(),
    files
  };
  await writeFile(
    path.join(packageDir, PACKAGE_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

async function writePackageChecklist(packageDir: string): Promise<void> {
  const modInfo = await readFile(path.join(packageDir, MODINFO_FILE), "utf8");
  const modMeta = parseModInfoMeta(modInfo);
  const checklist = [
    "# civ6-ai-copilot install checklist",
    "",
    "This generated checklist travels with the Mod package and lists the minimum install, sync, and verification steps.",
    "",
    "## Package",
    "",
    `- Folder name: ${MOD_FOLDER_NAME}`,
    `- Mod id: ${MOD_ID}`,
    `- Mod version: ${VERSION}`,
    `- Compat version: ${COMPAT_VERSION}`,
    `- Workshop version: ${modMeta.workshopVersion}`,
    `- Manifest: ${PACKAGE_MANIFEST_FILE}`,
    "",
    "## Install on Windows",
    "",
    "1. Copy this whole folder to:",
    "",
    "   %USERPROFILE%\\Documents\\My Games\\Sid Meier's Civilization VI\\Mods\\civ6-ai-copilot\\",
    "",
    `2. Confirm ${MODINFO_FILE} is directly inside civ6-ai-copilot, not nested one level deeper.`,
    "3. Start Civilization VI and open Additional Content.",
    "4. Enable Civ6 AI Copilot, start or load a real game, and confirm the Copilot icon button appears in the native left-top LaunchBar.",
    "5. Open the briefing panel and click `汇总本回合`. For war/map/settling questions, also click `更新地图情报`.",
    "",
    "## Verify the export",
    "",
    "Run these from the project checkout or tool bundle:",
    "",
    "```bash",
    "npm run paths -- --platform win32 --format powershell > civ6-ai-copilot-windows-smoke.ps1",
    "npm run bridge -- --input-log \"<Lua.log>\" --output-dir \"<snapshot-dir>\"",
    "# macOS/Aspyr without Lua.log, after clicking briefing sync in a real game:",
    "npm run tuner-bridge -- --output-dir \"<snapshot-dir>\" --state civ6_ai_copilot",
    "npm run doctor -- --input-log \"<Lua.log>\" --modding-log \"<Modding.log>\" --user-interface-log \"<UserInterface.log>\" --database-log \"<Database.log>\" --snapshot-dir \"<snapshot-dir>\" --format markdown",
    "npm run preflight -- --snapshot-dir \"<snapshot-dir>\" --intent turn-priority",
    "npm run handoff -- --snapshot-dir \"<snapshot-dir>\" --output-dir \"<handoff-dir>\" --intent turn-priority --clean",
    "npm run evidence:draft -- --input-log \"<Lua.log>\" --snapshot-dir \"<snapshot-dir>\" --handoff-dir \"<handoff-dir>\" --output \"<manual-evidence-draft.json>\" --format markdown",
    "npm run evidence:finalize -- --input \"<manual-evidence-draft.json>\" --output \"<manual-evidence.json>\" --confirm-windows-smoke --confirm-multiplayer-fairness --confirm-mac-codex-copilot --confirm-artifact-scope --civ6-build \"<civ6-build-id>\" --format markdown",
    "```",
    "",
    "The generated PowerShell script is an ordered smoke-test runbook. It pauses while the player opens Civ6, enables the Mod in Additional Content, and clicks briefing sync, then resumes local validation commands.",
    "",
    "## Safety",
    "",
    "- This package is a passive InGame UI exporter.",
    "- It should keep AffectsSavedGames=0 and should not modify rules, map, units, resources, diplomacy, production, or network sync state.",
    "- Use structured evidence JSON for release gates; keep local capture artifacts outside packaged releases.",
    "- Multiplayer evidence must come from each player's own visible snapshot only.",
    ""
  ].join("\n");
  await writeFile(path.join(packageDir, PACKAGE_CHECKLIST_FILE), checklist, "utf8");
}

async function validatePackageManifestIfPresent(packageDir: string, issues: string[]): Promise<void> {
  const manifestPath = path.join(packageDir, PACKAGE_MANIFEST_FILE);
  let manifestText = "";
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    return;
  }

  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(manifestText) as PackageManifest;
  } catch (error) {
    issues.push(`${PACKAGE_MANIFEST_FILE} is not valid JSON: ${(error as Error).message}`);
    return;
  }

  if (manifest.packageName !== MOD_FOLDER_NAME) {
    issues.push(`${PACKAGE_MANIFEST_FILE} packageName must be ${MOD_FOLDER_NAME}`);
  }
  if (manifest.manifestVersion !== VERSION) {
    issues.push(`${PACKAGE_MANIFEST_FILE} manifestVersion must be ${VERSION}`);
  }
  if (manifest.modInfoFile !== MODINFO_FILE) {
    issues.push(`${PACKAGE_MANIFEST_FILE} modInfoFile must be ${MODINFO_FILE}`);
  }
  if (manifest.installFolderName !== MOD_FOLDER_NAME) {
    issues.push(`${PACKAGE_MANIFEST_FILE} installFolderName must be ${MOD_FOLDER_NAME}`);
  }
  if (manifest.modId !== MOD_ID) {
    issues.push(`${PACKAGE_MANIFEST_FILE} modId must be ${MOD_ID}`);
  }
  if (manifest.modVersion !== VERSION) {
    issues.push(`${PACKAGE_MANIFEST_FILE} modVersion must be ${VERSION}`);
  }
  if (manifest.modGuid !== MOD_GUID) {
    issues.push(`${PACKAGE_MANIFEST_FILE} modGuid must be ${MOD_GUID}`);
  }
  if (manifest.workshopVersion !== WORKSHOP_VERSION) {
    issues.push(`${PACKAGE_MANIFEST_FILE} workshopVersion must be ${WORKSHOP_VERSION}`);
  }
  if (manifest.compatVersion !== COMPAT_VERSION) {
    issues.push(`${PACKAGE_MANIFEST_FILE} compatVersion must be ${COMPAT_VERSION}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    issues.push(`${PACKAGE_MANIFEST_FILE} must list package files`);
    return;
  }

  const actualFiles = await buildManifestFiles(packageDir);
  const actualByPath = new Map(actualFiles.map((file) => [file.path, file]));
  const declaredPaths = new Set<string>();

  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string") {
      issues.push(`${PACKAGE_MANIFEST_FILE} contains a file entry without path`);
      continue;
    }
    declaredPaths.add(file.path);
    const actual = actualByPath.get(file.path);
    if (!actual) {
      issues.push(`${PACKAGE_MANIFEST_FILE} lists missing file: ${file.path}`);
      continue;
    }
    if (file.sizeBytes !== actual.sizeBytes) {
      issues.push(`${PACKAGE_MANIFEST_FILE} size mismatch for ${file.path}`);
    }
    if (file.sha256 !== actual.sha256) {
      issues.push(`${PACKAGE_MANIFEST_FILE} sha256 mismatch for ${file.path}`);
    }
  }

  for (const actual of actualFiles) {
    if (!declaredPaths.has(actual.path)) {
      issues.push(`${PACKAGE_MANIFEST_FILE} is missing file entry: ${actual.path}`);
    }
  }
}

async function buildManifestFiles(packageDir: string): Promise<PackageManifestFile[]> {
  const files = await listFiles(packageDir);
  const manifestFiles: PackageManifestFile[] = [];
  for (const relativePath of files) {
    if (relativePath === PACKAGE_MANIFEST_FILE) {
      continue;
    }
    const absolutePath = path.join(packageDir, relativePath);
    const [fileStat, content] = await Promise.all([stat(absolutePath), readFile(absolutePath)]);
    manifestFiles.push({
      path: relativePath,
      sizeBytes: fileStat.size,
      sha256: createHash("sha256").update(content).digest("hex")
    });
  }
  return manifestFiles.sort((a, b) => a.path.localeCompare(b.path));
}

function parseModInfoMeta(modInfo: string): { modGuid: string; workshopVersion: string } {
  const modTag = modInfo.match(/<Mod\s+id="([^"]+)"\s+version="([^"]+)"/);
  return {
    modGuid: modTag?.[1] ?? "",
    workshopVersion: modTag?.[2] ?? ""
  };
}

function isGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function listFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rootDir, absolutePath)));
    } else if (entry.isFile()) {
      files.push(path.relative(rootDir, absolutePath).split(path.sep).join("/"));
    }
  }
  return files.sort();
}
