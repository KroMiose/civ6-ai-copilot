import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMPAT_VERSION,
  MOD_GUID,
  MOD_ID,
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
  VERSION,
  WORKSHOP_VERSION
} from "../tools/project/src/version.js";

test("static release metadata matches project-version.json", async () => {
  const [
    packageJson,
    snapshotSchema,
    manualEvidenceSchema,
    fixture,
    modInfo,
    lua,
    skill,
    openaiAgent,
    manualEvidenceTemplate
  ] = await Promise.all([
    readJson("package.json"),
    readJson("schemas/snapshot.schema.json"),
    readJson("schemas/manual-evidence.schema.json"),
    readJson("tests/fixtures/minimal-player-visible.snapshot.json"),
    readFile("mod/civ6-ai-copilot.modinfo", "utf8"),
    readFile("mod/ui/civ6_ai_copilot.lua", "utf8"),
    readFile("skill/SKILL.md", "utf8"),
    readFile("skill/agents/openai.yaml", "utf8"),
    readJson("tests/manual/manual-evidence-template.json")
  ]);

  assert.equal(packageJson.version, VERSION);
  assert.equal(snapshotSchema.properties.schemaVersion.const, SCHEMA_VERSION);
  assert.equal(snapshotSchema.properties.source.properties.modId.const, MOD_ID);
  assert.equal(manualEvidenceSchema.properties.schemaVersion.const, SCHEMA_VERSION);
  assert.equal(fixture.schemaVersion, SCHEMA_VERSION);
  assert.equal(fixture.source.modVersion, VERSION);
  assert.equal(fixture.source.compatVersion, COMPAT_VERSION);
  assert.equal(manualEvidenceTemplate.schemaVersion, SCHEMA_VERSION);

  assert.match(modInfo, new RegExp(`<Mod id="${escapeRegExp(MOD_GUID)}" version="${WORKSHOP_VERSION}">`));
  assert.match(modInfo, new RegExp(`<Version>${escapeRegExp(VERSION)}</Version>`));
  assert.match(lua, new RegExp(`local MOD_VERSION = "${escapeRegExp(VERSION)}"`));
  assert.match(lua, new RegExp(`local COMPAT_VERSION = "${escapeRegExp(COMPAT_VERSION)}"`));
  assert.match(lua, new RegExp(`local SCHEMA_VERSION = "${escapeRegExp(SCHEMA_VERSION)}"`));
  assert.match(lua, new RegExp(`local PROTOCOL_VERSION = "${escapeRegExp(PROTOCOL_VERSION)}"`));
  assert.match(skill, new RegExp(`^version: ${escapeRegExp(VERSION)}$`, "m"));
  assert.match(skill, new RegExp(`^compatVersion: "${escapeRegExp(COMPAT_VERSION)}"$`, "m"));
  assert.match(openaiAgent, new RegExp(`^version: ${escapeRegExp(VERSION)}$`, "m"));
  assert.match(openaiAgent, new RegExp(`^compatVersion: "${escapeRegExp(COMPAT_VERSION)}"$`, "m"));
});

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
