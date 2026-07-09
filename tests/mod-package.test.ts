import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPackageDirectory,
  defaultCiv6ModsDir,
  installMod,
  PACKAGE_CHECKLIST_FILE,
  MOD_FOLDER_NAME,
  PACKAGE_MANIFEST_FILE,
  validateInstalledMod,
  validateModSource
} from "../tools/package/src/mod-package.js";
import { COMPAT_VERSION, MOD_GUID, MOD_ID, VERSION, WORKSHOP_VERSION } from "../tools/project/src/version.js";

const sourceDir = path.resolve("mod");

test("mod package validator accepts the repository mod source", async () => {
  const validation = await validateModSource(sourceDir);
  assert.equal(validation.ok, true, JSON.stringify(validation, null, 2));
  assert.equal(validation.files.includes("civ6-ai-copilot.modinfo"), true);
  assert.equal(validation.files.includes("ui/civ6_ai_copilot.lua"), true);
  assert.equal(validation.files.includes("ui/civ6_ai_copilot.xml"), true);
  assert.equal(validation.files.includes("text/civ6-ai-copilot-text.xml"), true);
});

test("mod installer creates Civ6-compatible top-level mod folder", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-mods-"));
  try {
    const result = await installMod({ sourceDir, modsDir: tempDir, clean: true });
    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    assert.equal(path.basename(result.targetDir), MOD_FOLDER_NAME);
    await stat(path.join(result.targetDir, "civ6-ai-copilot.modinfo"));
    await stat(path.join(result.targetDir, "ui", "civ6_ai_copilot.lua"));
    await stat(path.join(result.targetDir, "ui", "civ6_ai_copilot.xml"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod package command creates manifest and release folder", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-package-"));
  try {
    const result = await createPackageDirectory({ sourceDir, outputDir: tempDir, clean: true });
    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    const manifest = JSON.parse(
      await readFile(path.join(result.packageDir, PACKAGE_MANIFEST_FILE), "utf8")
    );
    assert.equal(manifest.packageName, MOD_FOLDER_NAME);
    assert.equal(manifest.manifestVersion, VERSION);
    assert.equal(manifest.modInfoFile, "civ6-ai-copilot.modinfo");
    assert.equal(manifest.installFolderName, MOD_FOLDER_NAME);
    assert.equal(manifest.modId, MOD_ID);
    assert.equal(manifest.modGuid, MOD_GUID);
    assert.equal(manifest.modVersion, VERSION);
    assert.equal(manifest.compatVersion, COMPAT_VERSION);
    assert.equal(manifest.workshopVersion, WORKSHOP_VERSION);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === "civ6-ai-copilot.modinfo"), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === "text/civ6-ai-copilot-text.xml"), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === PACKAGE_CHECKLIST_FILE), true);
    assert.equal(manifest.files.every((file: { sha256: string; sizeBytes: number }) => /^[a-f0-9]{64}$/.test(file.sha256) && file.sizeBytes > 0), true);

    await stat(path.join(result.packageDir, PACKAGE_CHECKLIST_FILE));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod package manifest detects tampered release files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-package-tamper-"));
  try {
    const result = await createPackageDirectory({ sourceDir, outputDir: tempDir, clean: true });
    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    await writeFile(path.join(result.packageDir, "ui", "civ6_ai_copilot.lua"), "-- tampered\n", "utf8");

    const validation = await validateInstalledMod(result.packageDir);
    assert.equal(validation.ok, false);
    assert.equal(validation.issues.some((issue) => issue.includes("sha256 mismatch")), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects UI context packages without paired Lua files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-ui-pair-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const modInfoPath = path.join(badModDir, "civ6-ai-copilot.modinfo");
    const modInfo = await readFile(modInfoPath, "utf8");
    await writeFile(
      modInfoPath,
      modInfo.replace("    <File>ui/civ6_ai_copilot.lua</File>\n", ""),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(validation.issues.some((issue) => issue.includes("paired UI Lua file ui/civ6_ai_copilot.lua")), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects UI contexts whose paired Lua is not imported for the runtime", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-ui-import-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const modInfoPath = path.join(badModDir, "civ6-ai-copilot.modinfo");
    const modInfo = await readFile(modInfoPath, "utf8");
    await writeFile(
      modInfoPath,
      modInfo.replace(/    <ImportFiles id="CIV6_AI_COPILOT_FILES">[\s\S]*?    <\/ImportFiles>\n/, ""),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("must import paired UI Lua file ui/civ6_ai_copilot.lua")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects nested LuaContext loader wrappers for AddUserInterfaces", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-lua-context-loader-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const modInfoPath = path.join(badModDir, "civ6-ai-copilot.modinfo");
    const modInfo = await readFile(modInfoPath, "utf8");
    await writeFile(path.join(badModDir, "ui", "civ6_ai_copilot_loader.xml"), [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<Context>",
      '  <LuaContext ID="Civ6AICopilot" FileName="ui/civ6_ai_copilot" />',
      "</Context>",
      ""
    ].join("\n"), "utf8");
    await writeFile(
      modInfoPath,
      modInfo
        .replace("<File>ui/civ6_ai_copilot.xml</File>", "<File>ui/civ6_ai_copilot_loader.xml</File>")
        .replace("    <File>ui/civ6_ai_copilot.xml</File>\n", "    <File>ui/civ6_ai_copilot.xml</File>\n    <File>ui/civ6_ai_copilot_loader.xml</File>\n"),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("must be injected directly by AddUserInterfaces")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects static Copilot UI smoke controls outside the native LaunchBar", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-static-ui-placement-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const uiPath = path.join(badModDir, "ui", "civ6_ai_copilot.xml");
    const uiXml = await readFile(uiPath, "utf8");
    await writeFile(
      uiPath,
      uiXml
        .replace(
          /\n\s*<Instance Name="Civ6AICopilotLaunchItem">[\s\S]*?<\/Instance>/,
          '\n    <GridButton ID="CopilotButton" Anchor="R,T" Offset="-172,92" Size="124,32" Style="ShellTabSmall" String="LOC_CIV6_AI_COPILOT_BUTTON_COPILOT" />'
        )
        .replace(/\n\s*<Instance Name="Civ6AICopilotLaunchPin">[\s\S]*?<\/Instance>/, ""),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("CopilotButton must be a LaunchBar instance")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects text-only Copilot LaunchBar buttons without an icon control", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-text-only-launchbar-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const uiPath = path.join(badModDir, "ui", "civ6_ai_copilot.xml");
    const uiXml = await readFile(uiPath, "utf8");
    await writeFile(
      uiPath,
      uiXml
        .replace(/\n\s*<Image ID="CopilotButtonIcon"[^>]*\/>/, "")
        .replace(/ID="CopilotButtonLabel"([^>]*)String="LOC_CIV6_AI_COPILOT_BUTTON_COPILOT_SHORT"([^>]*)Hidden="1"/, 'ID="CopilotButtonLabel"$1String="AI"$2'),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("must expose CopilotButtonIcon")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects Copilot Lua that does not attach the button to Civ6 native LaunchBar", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-launchbar-attach-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const luaPath = path.join(badModDir, "ui", "civ6_ai_copilot.lua");
    const lua = await readFile(luaPath, "utf8");
    await writeFile(
      luaPath,
      lua
        .replace(/ContextPtr:LookUpControl\("\/InGame\/LaunchBar\/ButtonStack"\)/g, 'ContextPtr:LookUpControl("/InGame/WorldTracker")')
        .replace(/ContextPtr:BuildInstanceForControl\("Civ6AICopilotLaunchItem"/g, 'ContextPtr:BuildInstanceForControl("WrongInstance"'),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("must attach CopilotButton to /InGame/LaunchBar/ButtonStack")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects Copilot Lua without a LaunchBar attached diagnostic", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-launchbar-diagnostic-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const luaPath = path.join(badModDir, "ui", "civ6_ai_copilot.lua");
    const lua = await readFile(luaPath, "utf8");
    await writeFile(luaPath, lua.replace(/emitDiagnostic\("launchbar-attached"[\s\S]*?\n\s*}\)/, "-- missing launchbar-attached diagnostic"), "utf8");

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("must emit launchbar-attached")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects Copilot Lua without optional auto turn sync diagnostics", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-auto-sync-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const luaPath = path.join(badModDir, "ui", "civ6_ai_copilot.lua");
    const lua = await readFile(luaPath, "utf8");
    await writeFile(
      luaPath,
      lua
        .replace(/local autoSyncEnabled = false\n/, "")
        .replace(/emitDiagnostic\("auto-sync-exported"[\s\S]*?\n\s*}\)/, "-- missing auto-sync-exported diagnostic"),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("optional auto turn sync diagnostics")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects UI contexts without a visible XML-loaded Lua-pending diagnostic", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-ui-diagnostic-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const uiPath = path.join(badModDir, "ui", "civ6_ai_copilot.xml");
    const uiXml = await readFile(uiPath, "utf8");
    await writeFile(
      uiPath,
      uiXml
        .replace(/\n\s*<Label ID="XmlLoadedLabel"[^>]*\/>/, "")
        .replace(/ID="StatusLabel"([^>]*)String="[^"]+"/, 'ID="StatusLabel"$1String="LOC_CIV6_AI_COPILOT_STATUS_READY"'),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("XML-loaded Lua-pending diagnostic")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects Lua-unsafe UI context filenames", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-ui-name-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const modInfoPath = path.join(badModDir, "civ6-ai-copilot.modinfo");
    const modInfo = await readFile(modInfoPath, "utf8");
    await writeFile(
      modInfoPath,
      modInfo
        .replace(
          "  </InGameActions>",
          '    <AddUserInterfaces id="BAD_HYPHENATED_UI">\n      <Properties>\n        <Context>InGame</Context>\n      </Properties>\n      <File>ui/bad-context.xml</File>\n    </AddUserInterfaces>\n  </InGameActions>'
        )
        .replace(
          "  </Files>",
          "    <File>ui/bad-context.xml</File>\n    <File>ui/bad-context.lua</File>\n  </Files>"
        ),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("basename must use Lua-safe letters, numbers, and underscores")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects UI context names that do not match their Lua filename", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-context-name-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const uiPath = path.join(badModDir, "ui", "civ6_ai_copilot.xml");
    const uiXml = await readFile(uiPath, "utf8");
    await writeFile(uiPath, uiXml.replace(/<Context\b[^>]*>/, '<Context Name="Civ6AICopilot">'), "utf8");

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) =>
        issue.includes("Context Name must match its Lua-safe basename civ6_ai_copilot")
      ),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects gameplay actions in the passive UI exporter", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-action-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const modInfoPath = path.join(badModDir, "civ6-ai-copilot.modinfo");
    const modInfo = await readFile(modInfoPath, "utf8");
    await writeFile(
      modInfoPath,
      modInfo.replace(
        "  </InGameActions>",
        '    <UpdateDatabase id="BAD_GAMEPLAY_ACTION">\n      <File>bad.sql</File>\n    </UpdateDatabase>\n  </InGameActions>'
      ),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(validation.issues.some((issue) => issue.includes("unsupported action <UpdateDatabase>")), true);
    assert.equal(validation.issues.some((issue) => issue.includes("must not use <UpdateDatabase>")), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects hidden AddUserInterfaces contexts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-hidden-ui-context-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const luaPath = path.join(badModDir, "ui", "civ6_ai_copilot.lua");
    const lua = await readFile(luaPath, "utf8");
    await writeFile(luaPath, lua.replace("    ContextPtr:SetHide(false)\n", ""), "utf8");

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("must explicitly show the AddUserInterfaces context")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects malformed XML before real Civ6 loading", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-xml-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const uiPath = path.join(badModDir, "ui", "civ6_ai_copilot.xml");
    const uiXml = await readFile(uiPath, "utf8");
    await writeFile(uiPath, uiXml.replace("</Context>", "</BrokenContext>"), "utf8");

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(validation.issues.some((issue) => issue.includes("ui/civ6_ai_copilot.xml is not well-formed XML")), true);
    assert.equal(validation.issues.some((issue) => issue.includes("does not match <Context>")), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects Lua control references without matching XML IDs", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-control-binding-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const uiPath = path.join(badModDir, "ui", "civ6_ai_copilot.xml");
    const uiXml = await readFile(uiPath, "utf8");
    await writeFile(uiPath, uiXml.replace('ID="SyncGovernmentButton"', 'ID="SyncPolicyButton"'), "utf8");

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) =>
        issue.includes("ui/civ6_ai_copilot.lua references Controls.SyncGovernmentButton")
      ),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects Lua syntax surfaces before real Civ6 loading", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-lua-syntax-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const luaPath = path.join(badModDir, "ui", "civ6_ai_copilot.lua");
    const lua = await readFile(luaPath, "utf8");
    await writeFile(luaPath, `${lua}\nlocal badSyntax = "unterminated\n`, "utf8");

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("unclosed Lua string")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects Lua block mismatches before real Civ6 loading", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-lua-block-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const luaPath = path.join(badModDir, "ui", "civ6_ai_copilot.lua");
    const lua = await readFile(luaPath, "utf8");
    await writeFile(
      luaPath,
      lua.replace("\nend\n\ninitialize()\n", "\n\ninitialize()\n"),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("Lua block mismatch")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mod validator rejects selective sync code that reads unrequested high-level modules", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-bad-selective-sync-"));
  try {
    const badModDir = path.join(tempDir, "mod");
    await cp(sourceDir, badModDir, { recursive: true });
    const luaPath = path.join(badModDir, "ui", "civ6_ai_copilot.lua");
    const lua = await readFile(luaPath, "utf8");
    await writeFile(
      luaPath,
      lua.replace(
        'techs = includeTechs and collectProgression("techs", localPlayerId) or collectEmptyProgression("UNKNOWN_TECH")',
        'techs = collectProgression("techs", localPlayerId)'
      ),
      "utf8"
    );

    const validation = await validateModSource(badModDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("empty low-confidence tech placeholder")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("default Civ6 Mods path is platform specific and non-hardcoded", () => {
  assert.equal(
    defaultCiv6ModsDir("win32", "C:\\Users\\Player"),
    "C:\\Users\\Player\\Documents\\My Games\\Sid Meier's Civilization VI\\Mods"
  );
  assert.equal(
    defaultCiv6ModsDir("darwin", "/Users/player"),
    "/Users/player/Library/Application Support/Sid Meier's Civilization VI/Sid Meier's Civilization VI/Mods"
  );
  assert.equal(
    defaultCiv6ModsDir("linux", "/home/player"),
    "/home/player/.local/share/Aspyr/Sid Meier's Civilization VI/Mods"
  );
});
