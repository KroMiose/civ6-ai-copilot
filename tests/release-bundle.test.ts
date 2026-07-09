import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createReleaseBundle,
  RELEASE_BUNDLE_CHECKLIST_FILE,
  RELEASE_BUNDLE_FOLDER_NAME,
  RELEASE_BUNDLE_MANIFEST_FILE,
  RELEASE_MAC_COPILOT_SCRIPT_FILE,
  RELEASE_WINDOWS_SMOKE_SCRIPT_FILE,
  validateReleaseBundle
} from "../tools/release/src/release-bundle.js";
import { runRcCheck } from "../tools/release/src/rc-check.js";
import { runOfflineSmoke } from "../tools/smoke/src/offline-smoke.js";
import { VERSION } from "../tools/project/src/version.js";

test("release bundle packages Mod, skill, docs, manual tests, and manifest", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-release-bundle-"));
  try {
    const result = await createReleaseBundle({
      rootDir: path.resolve("."),
      outputDir: tempDir,
      clean: true
    });

    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    assert.equal(path.basename(result.bundleDir), RELEASE_BUNDLE_FOLDER_NAME);
    await stat(path.join(result.bundleDir, "mod", "civ6-ai-copilot", "civ6-ai-copilot.modinfo"));
    await stat(path.join(result.bundleDir, "skill", "civ6-ai-copilot", "SKILL.md"));
    await stat(path.join(result.bundleDir, "tooling", "package.json"));
    await stat(path.join(result.bundleDir, "tooling", "package-lock.json"));
    await stat(path.join(result.bundleDir, "tooling", ".gitignore"));
    await stat(path.join(result.bundleDir, "tooling", "tools", "bridge", "src", "cli.ts"));
    await stat(path.join(result.bundleDir, "tooling", "tools", "paths", "src", "civ6-paths-cli.ts"));
    await stat(path.join(result.bundleDir, "tooling", "schemas", "snapshot.schema.json"));
    await stat(path.join(result.bundleDir, "tooling", "tests", "fixtures", "minimal-player-visible.snapshot.json"));
    await stat(path.join(result.bundleDir, "manual-tests", "windows-civ6-smoke-test.md"));
    await stat(path.join(result.bundleDir, "manual-tests", "mac-codex-handoff-test.md"));
    await stat(path.join(result.bundleDir, "docs", "windows-mac-workflow.md"));
    await stat(path.join(result.bundleDir, RELEASE_WINDOWS_SMOKE_SCRIPT_FILE));
    await stat(path.join(result.bundleDir, RELEASE_MAC_COPILOT_SCRIPT_FILE));

    const manifest = JSON.parse(
      await readFile(path.join(result.bundleDir, RELEASE_BUNDLE_MANIFEST_FILE), "utf8")
    );
    assert.equal(manifest.packageName, RELEASE_BUNDLE_FOLDER_NAME);
    assert.equal(manifest.manifestVersion, VERSION);
    assert.equal(manifest.modFolder, "mod/civ6-ai-copilot");
    assert.equal(manifest.skillFolder, "skill/civ6-ai-copilot");
    assert.equal(manifest.files.some((file: { path: string }) => file.path === RELEASE_BUNDLE_CHECKLIST_FILE), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === RELEASE_WINDOWS_SMOKE_SCRIPT_FILE), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === RELEASE_MAC_COPILOT_SCRIPT_FILE), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === "skill/civ6-ai-copilot/SKILL.md"), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === "tooling/package.json"), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === "tooling/.gitignore"), true);
    assert.equal(manifest.files.some((file: { path: string }) => file.path === "tooling/tools/release/src/rc-check.ts"), true);
    assert.equal(
      manifest.files.every((file: { sha256: string; sizeBytes: number }) =>
        /^[a-f0-9]{64}$/.test(file.sha256) && file.sizeBytes > 0
      ),
      true
    );

    await stat(path.join(result.bundleDir, RELEASE_BUNDLE_CHECKLIST_FILE));
    const smokeScript = await readFile(path.join(result.bundleDir, RELEASE_WINDOWS_SMOKE_SCRIPT_FILE), "utf8");
    const macScript = await readFile(path.join(result.bundleDir, RELEASE_MAC_COPILOT_SCRIPT_FILE), "utf8");

    assert.match(smokeScript, /param\(/);
    assert.match(smokeScript, /\$HomeDir = \$env:USERPROFILE/);
    assert.match(smokeScript, /Join-Path \$PSScriptRoot 'tooling'/);
    assert.match(smokeScript, /npm install/);
    assert.match(smokeScript, /'--silent', 'run', 'paths'/);
    assert.match(smokeScript, /'--platform', 'win32'/);
    assert.match(smokeScript, /'--format', 'powershell'/);
    assert.match(smokeScript, /--civ6-user-data-dir/);
    assert.match(smokeScript, /--logs-dir/);
    assert.match(smokeScript, /--lua-log/);
    assert.match(smokeScript, /civ6-ai-copilot-windows-smoke\.generated\.ps1/);
    assert.doesNotMatch(smokeScript, /C:\\Users\\/);

    assert.match(macScript, /^#!\/usr\/bin\/env bash/);
    assert.match(macScript, /TOOLING_DIR="\$SCRIPT_DIR\/tooling"/);
    assert.match(macScript, /npm install/);
    assert.match(macScript, /npm run skill:install -- --clean/);
    assert.match(macScript, /npm run skill:validate-installed/);
    assert.match(macScript, /HANDOFF_DIR/);
    assert.match(macScript, /SNAPSHOT_DIR/);
    assert.match(macScript, /codex-prompt\.md/);
    assert.match(macScript, /copilot-handoff\.md/);
    assert.match(macScript, /npm run preflight/);
    assert.match(macScript, /npm run validate/);
    assert.match(macScript, /npm run summarize/);
    assert.match(macScript, /npm run handoff/);
    assert.match(macScript, /npm run smoke:offline/);
    assert.doesNotMatch(macScript, /\/Users\//);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release bundle tooling root can run offline smoke and RC automatic gates", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-release-smoke-"));
  try {
    const result = await createReleaseBundle({
      rootDir: path.resolve("."),
      outputDir: tempDir,
      clean: true
    });
    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));

    const smoke = await runOfflineSmoke({
      rootDir: path.join(result.bundleDir, "tooling"),
      outputDir: path.join(tempDir, "smoke-output"),
      clean: true
    });

    assert.equal(smoke.ok, true, JSON.stringify(smoke, null, 2));
    assert.equal(smoke.steps.some((step) => step.id === "doctor" && step.status === "pass"), true);
    assert.equal(smoke.steps.some((step) => step.id === "handoff" && step.status === "pass"), true);

    const rc = await runRcCheck({
      rootDir: path.join(result.bundleDir, "tooling")
    });
    assert.equal(rc.automaticOk, true, JSON.stringify(rc, null, 2));
    assert.equal(rc.gates.some((gate) => gate.id === "release-bundle" && gate.status === "pass"), true);
    assert.equal(rc.manualRequired.includes("manual-windows-civ6-load"), true);
    assert.equal(rc.manualRequired.includes("manual-multiplayer-fairness"), true);
    assert.equal(rc.manualRequired.includes("manual-mac-codex-copilot"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release bundle validation detects tampered files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-release-tamper-"));
  try {
    const result = await createReleaseBundle({
      rootDir: path.resolve("."),
      outputDir: tempDir,
      clean: true
    });
    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    await writeFile(path.join(result.bundleDir, "skill", "civ6-ai-copilot", "SKILL.md"), "# tampered\n", "utf8");

    const validation = await validateReleaseBundle(result.bundleDir);
    assert.equal(validation.ok, false);
    assert.equal(validation.issues.some((issue) => issue.includes("sha256 mismatch")), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release bundle validation detects broken root helper scripts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-release-script-tamper-"));
  try {
    const result = await createReleaseBundle({
      rootDir: path.resolve("."),
      outputDir: tempDir,
      clean: true
    });
    assert.equal(result.validation.ok, true, JSON.stringify(result.validation, null, 2));
    await writeFile(
      path.join(result.bundleDir, RELEASE_MAC_COPILOT_SCRIPT_FILE),
      "#!/usr/bin/env bash\nset -euo pipefail\n",
      "utf8"
    );

    const validation = await validateReleaseBundle(result.bundleDir);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.issues.some((issue) => issue.includes("missing required release helper step")),
      true
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
