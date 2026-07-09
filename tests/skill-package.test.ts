import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSkillPackageDirectory,
  defaultCodexSkillsDir,
  installSkill,
  SKILL_FOLDER_NAME,
  SKILL_PACKAGE_CHECKLIST_FILE,
  SKILL_PACKAGE_MANIFEST_FILE,
  validatePackagedSkill,
  validateSkillSource
} from "../tools/skill-package/src/skill-package.js";
import { COMPAT_VERSION, VERSION } from "../tools/project/src/version.js";

const sourceDir = path.resolve("skill");

test("skill package validator accepts the repository skill source", async () => {
  const validation = await validateSkillSource(sourceDir);
  assert.equal(validation.ok, true, JSON.stringify(validation, null, 2));
  assert.equal(validation.files.includes("SKILL.md"), true);
  assert.equal(validation.files.includes("agents/openai.yaml"), true);
  assert.equal(validation.files.includes("references/in-game-briefing-guide.md"), true);
  assert.equal(validation.files.includes("references/mod-usage-guide.md"), true);
  assert.equal(validation.files.includes("references/sync-module-guide.md"), true);
  assert.equal(validation.files.includes("scripts/suggest-sync.mjs"), true);
});

test("skill package command creates a manifest and install checklist", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-skill-package-"));
  try {
    const result = await createSkillPackageDirectory({ sourceDir, outputDir: tempDir, clean: true });
    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    assert.equal(path.basename(result.packageDir), SKILL_FOLDER_NAME);
    await stat(path.join(result.packageDir, "SKILL.md"));
    await stat(path.join(result.packageDir, "references", "in-game-briefing-guide.md"));
    await stat(path.join(result.packageDir, "references", "mod-usage-guide.md"));

    const manifest = JSON.parse(
      await readFile(path.join(result.packageDir, SKILL_PACKAGE_MANIFEST_FILE), "utf8")
    );
    assert.equal(manifest.packageName, SKILL_FOLDER_NAME);
    assert.equal(manifest.manifestVersion, VERSION);
    assert.equal(manifest.skillVersion, VERSION);
    assert.equal(manifest.compatVersion, COMPAT_VERSION);
    assert.equal(manifest.skillName, SKILL_FOLDER_NAME);
    assert.equal(manifest.entryFile, "SKILL.md");
    assert.equal(manifest.installFolderName, SKILL_FOLDER_NAME);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === "SKILL.md"), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === "scripts/suggest-sync.mjs"), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === SKILL_PACKAGE_CHECKLIST_FILE), true);
    assert.equal(
      manifest.files.every((file: { sha256: string; sizeBytes: number }) =>
        /^[a-f0-9]{64}$/.test(file.sha256) && file.sizeBytes > 0
      ),
      true
    );

    await stat(path.join(result.packageDir, SKILL_PACKAGE_CHECKLIST_FILE));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("skill installer copies the Mod-guided skill into a Codex skills directory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-skill-install-"));
  try {
    const skillsDir = path.join(tempDir, "skills");
    const result = await installSkill({ sourceDir, skillsDir, clean: true });

    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    assert.equal(result.targetDir, path.join(skillsDir, SKILL_FOLDER_NAME));

    await stat(path.join(result.targetDir, "SKILL.md"));
    await stat(path.join(result.targetDir, "references", "in-game-briefing-guide.md"));
    await stat(path.join(result.targetDir, "references", "mod-usage-guide.md"));
    await stat(path.join(result.targetDir, "scripts", "suggest-sync.mjs"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("default Codex skills directory honors CODEX_HOME without hardcoding machine-specific paths", () => {
  assert.equal(
    defaultCodexSkillsDir({ CODEX_HOME: "/tmp/codex-home" }, "/Users/player"),
    "/tmp/codex-home/skills"
  );
  assert.equal(
    defaultCodexSkillsDir({}, "/Users/player"),
    path.join("/Users/player", ".codex", "skills")
  );
});

test("skill package manifest detects tampered release files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-skill-tamper-"));
  try {
    const result = await createSkillPackageDirectory({ sourceDir, outputDir: tempDir, clean: true });
    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    await writeFile(path.join(result.packageDir, "SKILL.md"), "# tampered\n", "utf8");

    const validation = await validatePackagedSkill(result.packageDir);
    assert.equal(validation.ok, false);
    assert.equal(validation.issues.some((issue) => issue.includes("sha256 mismatch")), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
