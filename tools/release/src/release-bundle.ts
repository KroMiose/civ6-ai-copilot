import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPackageDirectory,
  MOD_FOLDER_NAME,
  validateModSource,
  validateInstalledMod
} from "../../package/src/mod-package.js";
import {
  createSkillPackageDirectory,
  SKILL_FOLDER_NAME,
  validateSkillSource,
  validatePackagedSkill
} from "../../skill-package/src/skill-package.js";
import { VERSION } from "../../project/src/version.js";

export const RELEASE_BUNDLE_FOLDER_NAME = "civ6-ai-copilot-release";
export const RELEASE_BUNDLE_MANIFEST_FILE = "civ6-ai-copilot-release-manifest.json";
export const RELEASE_BUNDLE_CHECKLIST_FILE = "civ6-ai-copilot-release-checklist.md";
export const RELEASE_WINDOWS_SMOKE_SCRIPT_FILE = "civ6-ai-copilot-windows-smoke.ps1";
export const RELEASE_MAC_COPILOT_SCRIPT_FILE = "civ6-ai-copilot-mac-copilot-smoke.sh";

export interface ReleaseBundleValidation {
  ok: boolean;
  issues: string[];
  files: string[];
}

export interface CreateReleaseBundleOptions {
  rootDir: string;
  outputDir: string;
  clean?: boolean;
}

export interface CreateReleaseBundleResult {
  bundleDir: string;
  validation: ReleaseBundleValidation;
}

export interface ReleaseBundleManifestFile {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface ReleaseBundleManifest {
  packageName: string;
  manifestVersion: string;
  generatedAt: string;
  modFolder: string;
  skillFolder: string;
  files: ReleaseBundleManifestFile[];
}

const requiredBundleFiles = [
  `${RELEASE_BUNDLE_CHECKLIST_FILE}`,
  `${RELEASE_WINDOWS_SMOKE_SCRIPT_FILE}`,
  `${RELEASE_MAC_COPILOT_SCRIPT_FILE}`,
  `mod/${MOD_FOLDER_NAME}/civ6-ai-copilot.modinfo`,
  `skill/${SKILL_FOLDER_NAME}/SKILL.md`,
  "tooling/package.json",
  "tooling/package-lock.json",
  "tooling/project-version.json",
  "tooling/tsconfig.json",
  "tooling/.gitignore",
  "tooling/tools/bridge/src/cli.ts",
  "tooling/tools/project/src/version.ts",
  "tooling/tools/tuner-bridge/src/cli.ts",
  "tooling/tools/tuner-bridge/src/nexus-client.ts",
  "tooling/tools/tuner-bridge/src/tuner-bridge.ts",
  "tooling/tools/doctor/src/doctor.ts",
  "tooling/tools/paths/src/civ6-paths-cli.ts",
  "tooling/tools/release/src/manual-evidence-finalize-cli.ts",
  "tooling/tools/release/src/rc-check.ts",
  "tooling/schemas/snapshot.schema.json",
  "tooling/tests/fixtures/minimal-player-visible.snapshot.json",
  "tooling/tests/manual/windows-civ6-smoke-test.md",
  "tooling/tests/manual/mac-codex-handoff-test.md",
  "tooling/mod/civ6-ai-copilot.modinfo",
  "tooling/skill/SKILL.md",
  "manual-tests/windows-civ6-smoke-test.md",
  "manual-tests/multiplayer-fairness-test.md",
  "manual-tests/mac-codex-handoff-test.md",
  "manual-tests/manual-evidence-template.json",
  "docs/current-status.md",
  "docs/mod-installation-and-test.md",
  "docs/windows-mac-workflow.md"
];

export async function createReleaseBundle(options: CreateReleaseBundleOptions): Promise<CreateReleaseBundleResult> {
  const rootDir = path.resolve(options.rootDir);
  const bundleDir = path.join(path.resolve(options.outputDir), RELEASE_BUNDLE_FOLDER_NAME);

  if (options.clean) {
    await rm(bundleDir, { recursive: true, force: true });
  }
  await mkdir(bundleDir, { recursive: true });

  const modPackage = await createPackageDirectory({
    sourceDir: path.join(rootDir, "mod"),
    outputDir: path.join(bundleDir, "mod"),
    clean: true
  });
  if (!modPackage.validation.ok) {
    return {
      bundleDir,
      validation: {
        ok: false,
        issues: modPackage.validation.issues.map((issue) => `mod package: ${issue}`),
        files: []
      }
    };
  }

  const skillPackage = await createSkillPackageDirectory({
    sourceDir: path.join(rootDir, "skill"),
    outputDir: path.join(bundleDir, "skill"),
    clean: true
  });
  if (!skillPackage.validation.ok) {
    return {
      bundleDir,
      validation: {
        ok: false,
        issues: skillPackage.validation.issues.map((issue) => `skill package: ${issue}`),
        files: []
      }
    };
  }

  await copyReleaseSupportFiles(rootDir, bundleDir);
  await copyToolingProject(rootDir, bundleDir);
  await writeReleaseWindowsSmokeScript(bundleDir);
  await writeReleaseMacCopilotScript(bundleDir);
  await writeReleaseChecklist(bundleDir);
  await writeReleaseManifest(bundleDir);

  return {
    bundleDir,
    validation: await validateReleaseBundle(bundleDir)
  };
}

export async function validateReleaseBundle(bundleDir: string): Promise<ReleaseBundleValidation> {
  const issues: string[] = [];
  const files: string[] = [];

  if (path.basename(bundleDir) !== RELEASE_BUNDLE_FOLDER_NAME) {
    issues.push(`release bundle folder should be named ${RELEASE_BUNDLE_FOLDER_NAME}`);
  }

  for (const relativePath of requiredBundleFiles) {
    try {
      const fileStat = await stat(path.join(bundleDir, relativePath));
      if (!fileStat.isFile()) {
        issues.push(`${relativePath} exists but is not a file`);
      } else {
        files.push(relativePath);
      }
    } catch {
      issues.push(`missing required file: ${relativePath}`);
    }
  }

  const modValidation = await validateInstalledMod(path.join(bundleDir, "mod", MOD_FOLDER_NAME));
  if (!modValidation.ok) {
    issues.push(...modValidation.issues.map((issue) => `mod package: ${issue}`));
  }

  const skillValidation = await validatePackagedSkill(path.join(bundleDir, "skill", SKILL_FOLDER_NAME));
  if (!skillValidation.ok) {
    issues.push(...skillValidation.issues.map((issue) => `skill package: ${issue}`));
  }

  const toolingModValidation = await validateModSource(path.join(bundleDir, "tooling", "mod"));
  if (!toolingModValidation.ok) {
    issues.push(...toolingModValidation.issues.map((issue) => `tooling mod source: ${issue}`));
  }

  const toolingSkillValidation = await validateSkillSource(path.join(bundleDir, "tooling", "skill"));
  if (!toolingSkillValidation.ok) {
    issues.push(...toolingSkillValidation.issues.map((issue) => `tooling skill source: ${issue}`));
  }

  await validateReleaseManifestIfPresent(bundleDir, issues);
  await validateReleaseHelperScripts(bundleDir, issues);

  return {
    ok: issues.length === 0,
    issues,
    files
  };
}

async function copyReleaseSupportFiles(rootDir: string, bundleDir: string): Promise<void> {
  await mkdir(path.join(bundleDir, "manual-tests"), { recursive: true });
  await mkdir(path.join(bundleDir, "docs"), { recursive: true });
  const copies = [
    ["tests/manual/windows-civ6-smoke-test.md", "manual-tests/windows-civ6-smoke-test.md"],
    ["tests/manual/multiplayer-fairness-test.md", "manual-tests/multiplayer-fairness-test.md"],
    ["tests/manual/mac-codex-handoff-test.md", "manual-tests/mac-codex-handoff-test.md"],
    ["tests/manual/manual-evidence-template.json", "manual-tests/manual-evidence-template.json"],
    ["docs/current-status.md", "docs/current-status.md"],
    ["docs/mod-installation-and-test.md", "docs/mod-installation-and-test.md"],
    ["docs/windows-mac-workflow.md", "docs/windows-mac-workflow.md"],
    ["README.md", "README.md"]
  ];

  for (const [from, to] of copies) {
    await cp(path.join(rootDir, from), path.join(bundleDir, to));
  }
}

async function copyToolingProject(rootDir: string, bundleDir: string): Promise<void> {
  const toolingDir = path.join(bundleDir, "tooling");
  await mkdir(toolingDir, { recursive: true });

  const fileCopies = [
    ".gitignore",
    "package.json",
    "package-lock.json",
    "project-version.json",
    "tsconfig.json",
    "README.md"
  ];
  for (const relativePath of fileCopies) {
    await cp(path.join(rootDir, relativePath), path.join(toolingDir, relativePath));
  }

  const directoryCopies = [
    "docs",
    "mod",
    "schemas",
    "skill",
    "tests",
    "tools"
  ];
  for (const relativePath of directoryCopies) {
    await cp(path.join(rootDir, relativePath), path.join(toolingDir, relativePath), {
      recursive: true,
      filter: (source) =>
        !source.includes(`${path.sep}.DS_Store`) &&
        !source.includes(`${path.sep}node_modules${path.sep}`) &&
        !source.endsWith(`${path.sep}dist`)
    });
  }
}

async function writeReleaseChecklist(bundleDir: string): Promise<void> {
  const checklist = [
    "# civ6-ai-copilot release checklist",
    "",
    "This generated bundle contains the Mod package, Codex skill package, tooling project, manual-test templates, setup docs, helper scripts, and file manifests.",
    "",
    "## Contents",
    "",
    `- Mod package: mod/${MOD_FOLDER_NAME}/`,
    `- Skill package: skill/${SKILL_FOLDER_NAME}/`,
    "- Tooling project: tooling/",
    "- Manual tests: manual-tests/",
    "- Setup docs: docs/",
    `- Bundle manifest: ${RELEASE_BUNDLE_MANIFEST_FILE}`,
    `- Windows smoke script: ${RELEASE_WINDOWS_SMOKE_SCRIPT_FILE}`,
    `- Mac copilot smoke script: ${RELEASE_MAC_COPILOT_SCRIPT_FILE}`,
    "",
    "## Windows game machine",
    "",
    "0. Easiest path: run the bundled PowerShell smoke script from the release bundle root. It uses the current Windows user's `%USERPROFILE%` at runtime and pauses while you open Civ6, enable the Mod, and click Copilot sync:",
    "",
    "   ```powershell",
    `   .\\${RELEASE_WINDOWS_SMOKE_SCRIPT_FILE}`,
    "   ```",
    "",
    "   If your Civ6 Documents folder is redirected, pass explicit paths:",
    "",
    "   ```powershell",
    `   .\\${RELEASE_WINDOWS_SMOKE_SCRIPT_FILE} -Civ6UserDataDir \"D:\\Civ6UserData\" -ModsDir \"E:\\Civ6Mods\" -LogsDir \"D:\\Civ6UserData\\Logs\"`,
    "   ```",
    "",
    "1. Manual path: from `tooling/`, print platform-specific paths and copyable commands:",
    "",
    "   ```bash",
    "   cd tooling",
    "   npm install",
    "   npm run paths -- --platform win32 --format markdown",
    "   npm run paths -- --platform win32 --format powershell > civ6-ai-copilot-windows-smoke.ps1",
    "   npm run mod -- install --clean --mods-dir \"<Windows Civ6 Mods dir>\"",
    "   npm run smoke:offline -- --output-dir \"<offline-smoke-output>\" --clean",
    "   npm run rc:check -- --format markdown",
    "   ```",
    "",
    "2. Confirm the install command created this folder. If the command cannot access the target directory, manually copy `mod/civ6-ai-copilot/` there as a fallback:",
    "",
    "   `%USERPROFILE%\\Documents\\My Games\\Sid Meier's Civilization VI\\Mods\\civ6-ai-copilot\\`",
    "",
    "3. Start Civilization VI, open Additional Content, enable Civ6 AI Copilot, and start or load a real game.",
    "4. Confirm the Copilot icon button appears in the native left-top LaunchBar.",
    "5. Open the Copilot panel and click `整理本回合`; for war/map/settling questions, also click `更新地图视野`.",
    "6. Run bridge/doctor from this bundle's tooling project. The paths command above prints the same commands with your target directories:",
    "",
    "   ```bash",
   "   cd tooling",
   "   npm run bridge -- --input-log \"<Lua.log>\" --output-dir \"<snapshot-dir>\" --watch",
   "   # macOS/Aspyr without Lua.log, after clicking Copilot sync in-game:",
   "   npm run tuner-bridge -- --output-dir \"<snapshot-dir>\" --state civ6_ai_copilot",
   "   npm run doctor -- --input-log \"<Lua.log>\" --modding-log \"<Modding.log>\" --user-interface-log \"<UserInterface.log>\" --database-log \"<Database.log>\" --snapshot-dir \"<snapshot-dir>\" --format markdown",
   "   ```",
    "",
    "## Mac Codex copilot",
    "",
    "0. Easiest path: on the Mac, run the bundled copilot smoke script from the release bundle root. With no environment variables it validates the Mac tooling and Mod-first skill using the sanitized offline loop:",
    "",
    "   ```bash",
    `   ./${RELEASE_MAC_COPILOT_SCRIPT_FILE}`,
    "   ```",
    "",
    "   With a real Windows handoff directory synced to the Mac, point the script at it:",
    "",
    "   ```bash",
    `   HANDOFF_DIR=\"<handoff-dir>\" ./${RELEASE_MAC_COPILOT_SCRIPT_FILE} \"<question>\"`,
    "   ```",
    "",
    "   Or generate a fresh handoff from a synced snapshot directory:",
    "",
    "   ```bash",
    `   SNAPSHOT_DIR=\"<snapshot-dir>\" HANDOFF_OUTPUT_DIR=\"<handoff-dir>\" ./${RELEASE_MAC_COPILOT_SCRIPT_FILE} \"<question>\"`,
    "   ```",
    "",
    "1. Manual path: from `tooling/`, install and validate the Mod-first Agent skill. Use `--skills-dir` if your Codex/Claude Code client uses a different skills directory:",
    "",
    "   ```bash",
    "   cd tooling",
    "   npm run skill:install -- --clean",
    "   npm run skill:validate-installed",
    "   # custom skill directory:",
    "   npm run skill:install -- --skills-dir \"<skills-dir>\" --clean",
    "   npm run skill:validate-installed -- --skills-dir \"<skills-dir>\"",
    "   ```",
    "",
    "   Manual fallback: copy `skill/civ6-ai-copilot/` to `<skills-dir>/civ6-ai-copilot/`.",
    "",
    "2. From `tooling/`, sync the Windows `<snapshot-dir>` or generate a handoff directory:",
    "",
    "   ```bash",
    "   cd tooling",
    "   npm run handoff -- --snapshot-dir \"<snapshot-dir>\" --output-dir \"<handoff-dir>\" --question \"<question>\" --clean",
    "   ```",
    "",
    "3. In Codex, read `<handoff-dir>/codex-prompt.md` first, then `<handoff-dir>/copilot-handoff.md`. If either asks for more data, return to the Windows Copilot panel and sync the named module.",
    "",
    "## Manual evidence",
    "",
    "Use `manual-tests/windows-civ6-smoke-test.md`, `manual-tests/multiplayer-fairness-test.md`, and `manual-tests/mac-codex-handoff-test.md`. Then generate a sanitized evidence draft:",
    "",
    "```bash",
    "cd tooling",
    "npm run evidence:draft -- --input-log \"<Lua.log>\" --snapshot-dir \"<snapshot-dir>\" --handoff-dir \"<handoff-dir>\" --player-a-snapshot \"<player-a latest.json>\" --player-b-snapshot \"<player-b latest.json>\" --output \"<manual-evidence-draft.json>\" --format markdown",
    "npm run evidence:finalize -- --input \"<manual-evidence-draft.json>\" --output \"<manual-evidence.json>\" --confirm-windows-smoke --confirm-multiplayer-fairness --confirm-mac-codex-copilot --confirm-artifact-scope --civ6-build \"<civ6-build-id>\" --format markdown",
    "npm run evidence:validate -- --evidence \"<manual-evidence.json>\" --format markdown",
    "npm run rc:check -- --manual-evidence \"<manual-evidence.json>\" --format markdown",
    "```",
    "",
    "## Safety",
    "",
    "- Multiplayer use must stay local-player visible only.",
    "- Do not export hidden map, invisible units, unmet players, or other players' private tech/civics/policies/city queues.",
    "- Keep local capture artifacts, player identifiers, and machine-specific paths outside published release materials.",
    ""
  ].join("\n");
  await writeFile(path.join(bundleDir, RELEASE_BUNDLE_CHECKLIST_FILE), checklist, "utf8");
}

async function writeReleaseWindowsSmokeScript(bundleDir: string): Promise<void> {
  const script = [
    "param(",
    "  [string]$HomeDir = $env:USERPROFILE,",
    "  [string]$Civ6UserDataDir = '',",
    "  [string]$ModsDir = '',",
    "  [string]$LogsDir = '',",
    "  [string]$LuaLog = '',",
    "  [string]$SnapshotDir = '',",
    "  [string]$HandoffDir = '',",
    "  [string]$Question = 'What should I do this turn?'",
    ")",
    "",
    "$ErrorActionPreference = 'Stop'",
    "",
    "$toolingDir = Join-Path $PSScriptRoot 'tooling'",
    "if (-not (Test-Path $toolingDir)) {",
    "  throw \"Cannot find tooling directory next to this script: $toolingDir\"",
    "}",
    "",
    "$argsList = @('--silent', 'run', 'paths', '--', '--platform', 'win32', '--home', $HomeDir, '--format', 'powershell', '--question', $Question)",
    "if ($Civ6UserDataDir) { $argsList += @('--civ6-user-data-dir', $Civ6UserDataDir) }",
    "if ($ModsDir) { $argsList += @('--mods-dir', $ModsDir) }",
    "if ($LogsDir) { $argsList += @('--logs-dir', $LogsDir) }",
    "if ($LuaLog) { $argsList += @('--lua-log', $LuaLog) }",
    "if ($SnapshotDir) { $argsList += @('--snapshot-dir', $SnapshotDir) }",
    "if ($HandoffDir) { $argsList += @('--handoff-dir', $HandoffDir) }",
    "",
    "$generatedScript = Join-Path $toolingDir 'civ6-ai-copilot-windows-smoke.generated.ps1'",
    "Push-Location $toolingDir",
    "try {",
    "  npm install",
    "  npm @argsList | Out-File -FilePath $generatedScript -Encoding utf8",
    "  Write-Host \"Generated runbook: $generatedScript\" -ForegroundColor Cyan",
    "  & $generatedScript",
    "} finally {",
    "  Pop-Location",
    "}",
    ""
  ].join("\n");
  await writeFile(path.join(bundleDir, RELEASE_WINDOWS_SMOKE_SCRIPT_FILE), script, "utf8");
}

async function writeReleaseMacCopilotScript(bundleDir: string): Promise<void> {
  const script = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "SCRIPT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\"",
    "TOOLING_DIR=\"$SCRIPT_DIR/tooling\"",
    "QUESTION=\"${1:-What should I do this turn?}\"",
    "HANDOFF_DIR=\"${HANDOFF_DIR:-}\"",
    "SNAPSHOT_DIR=\"${SNAPSHOT_DIR:-}\"",
    "SMOKE_OUTPUT_DIR=\"${SMOKE_OUTPUT_DIR:-${TMPDIR:-/tmp}/civ6-ai-copilot-mac-copilot-smoke}\"",
    "",
    "if [[ ! -d \"$TOOLING_DIR\" ]]; then",
    "  echo \"Cannot find tooling directory next to this script: $TOOLING_DIR\" >&2",
    "  exit 1",
    "fi",
    "",
    "run_copilot_preflight() {",
    "  local snapshot_path=\"$1\"",
    "  set +e",
    "  npm run preflight -- --snapshot \"$snapshot_path\" --question \"$QUESTION\"",
    "  local preflight_status=$?",
    "  set -e",
    "  if [[ \"$preflight_status\" -ne 0 && \"$preflight_status\" -ne 2 ]]; then",
    "    exit \"$preflight_status\"",
    "  fi",
    "}",
    "",
    "run_handoff() {",
    "  local snapshot_dir=\"$1\"",
    "  local output_dir=\"$2\"",
    "  set +e",
    "  npm run handoff -- --snapshot-dir \"$snapshot_dir\" --output-dir \"$output_dir\" --question \"$QUESTION\" --clean",
    "  local handoff_status=$?",
    "  set -e",
    "  if [[ \"$handoff_status\" -ne 0 && \"$handoff_status\" -ne 2 ]]; then",
    "    exit \"$handoff_status\"",
    "  fi",
    "}",
    "",
    "cd \"$TOOLING_DIR\"",
    "npm install",
    "npm run skill:install -- --clean",
    "npm run skill:validate-installed",
    "",
    "if [[ -n \"$HANDOFF_DIR\" ]]; then",
    "  if [[ ! -f \"$HANDOFF_DIR/codex-prompt.md\" ]]; then",
    "    echo \"Missing handoff prompt: $HANDOFF_DIR/codex-prompt.md\" >&2",
    "    exit 1",
    "  fi",
    "  if [[ ! -f \"$HANDOFF_DIR/copilot-handoff.md\" ]]; then",
    "    echo \"Missing copilot handoff: $HANDOFF_DIR/copilot-handoff.md\" >&2",
    "    exit 1",
    "  fi",
    "  if [[ -f \"$HANDOFF_DIR/latest.json\" ]]; then",
    "    npm run validate -- \"$HANDOFF_DIR/latest.json\"",
    "    run_copilot_preflight \"$HANDOFF_DIR/latest.json\"",
    "    npm run summarize -- --snapshot \"$HANDOFF_DIR/latest.json\" --question \"$QUESTION\"",
    "  else",
    "    echo \"Handoff has prompt files but no latest.json; Codex should follow the prompt and request sync if needed.\"",
    "  fi",
    "  echo \"Mac copilot handoff is ready: $HANDOFF_DIR\"",
    "elif [[ -n \"$SNAPSHOT_DIR\" ]]; then",
    "  HANDOFF_OUTPUT_DIR=\"${HANDOFF_OUTPUT_DIR:-$SNAPSHOT_DIR/handoff}\"",
    "  run_handoff \"$SNAPSHOT_DIR\" \"$HANDOFF_OUTPUT_DIR\"",
    "  if [[ ! -f \"$HANDOFF_OUTPUT_DIR/codex-prompt.md\" || ! -f \"$HANDOFF_OUTPUT_DIR/copilot-handoff.md\" ]]; then",
    "    echo \"Handoff generation did not create codex-prompt.md and copilot-handoff.md in $HANDOFF_OUTPUT_DIR\" >&2",
    "    exit 1",
    "  fi",
    "  echo \"Generated Mac copilot handoff: $HANDOFF_OUTPUT_DIR\"",
    "else",
    "  npm run smoke:offline -- --output-dir \"$SMOKE_OUTPUT_DIR\" --clean --question \"$QUESTION\"",
    "  if [[ ! -f \"$SMOKE_OUTPUT_DIR/handoff/codex-prompt.md\" || ! -f \"$SMOKE_OUTPUT_DIR/handoff/copilot-handoff.md\" ]]; then",
    "    echo \"Offline smoke did not create the expected handoff files in $SMOKE_OUTPUT_DIR/handoff\" >&2",
    "    exit 1",
    "  fi",
    "  echo \"Offline Mac copilot smoke passed: $SMOKE_OUTPUT_DIR/handoff\"",
    "fi",
    "",
    "cat <<'EOF'",
    "Next in Codex:",
    "1. Read <handoff-dir>/codex-prompt.md first.",
    "2. Then read <handoff-dir>/copilot-handoff.md and copilot-summary.md.",
    "3. If they ask for more sync, return to the Windows Copilot panel and sync the named module before analysis.",
    "EOF",
    ""
  ].join("\n");
  await writeFile(path.join(bundleDir, RELEASE_MAC_COPILOT_SCRIPT_FILE), script, {
    encoding: "utf8",
    mode: 0o755
  });
}

async function validateReleaseHelperScripts(bundleDir: string, issues: string[]): Promise<void> {
  await validateScriptContract(
    bundleDir,
    RELEASE_WINDOWS_SMOKE_SCRIPT_FILE,
    [
      "Join-Path $PSScriptRoot 'tooling'",
      "$argsList = @('--silent', 'run', 'paths'",
      "'--platform', 'win32'",
      "'--format', 'powershell'",
      "npm install",
      "& $generatedScript"
    ],
    issues
  );
  await validateScriptContract(
    bundleDir,
    RELEASE_MAC_COPILOT_SCRIPT_FILE,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "TOOLING_DIR=\"$SCRIPT_DIR/tooling\"",
      "npm run skill:install -- --clean",
      "npm run skill:validate-installed",
      "HANDOFF_DIR",
      "SNAPSHOT_DIR",
      "codex-prompt.md",
      "copilot-handoff.md",
      "npm run preflight",
      "npm run validate",
      "npm run summarize",
      "npm run handoff",
      "npm run smoke:offline"
    ],
    issues
  );
}

async function validateScriptContract(
  bundleDir: string,
  relativePath: string,
  requiredSnippets: string[],
  issues: string[]
): Promise<void> {
  let content = "";
  try {
    content = await readFile(path.join(bundleDir, relativePath), "utf8");
  } catch {
    return;
  }

  for (const snippet of requiredSnippets) {
    if (!content.includes(snippet)) {
      issues.push(`${relativePath} is missing required release helper step: ${snippet}`);
    }
  }
  if (/\/Users\/|C:\\Users\\/.test(content)) {
    issues.push(`${relativePath} must not contain a personal user path`);
  }
}

async function writeReleaseManifest(bundleDir: string): Promise<void> {
  const files = await buildManifestFiles(bundleDir);
  const manifest: ReleaseBundleManifest = {
    packageName: RELEASE_BUNDLE_FOLDER_NAME,
    manifestVersion: VERSION,
    generatedAt: new Date().toISOString(),
    modFolder: `mod/${MOD_FOLDER_NAME}`,
    skillFolder: `skill/${SKILL_FOLDER_NAME}`,
    files
  };
  await writeFile(
    path.join(bundleDir, RELEASE_BUNDLE_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

async function validateReleaseManifestIfPresent(bundleDir: string, issues: string[]): Promise<void> {
  const manifestPath = path.join(bundleDir, RELEASE_BUNDLE_MANIFEST_FILE);
  let manifestText = "";
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    issues.push(`missing required file: ${RELEASE_BUNDLE_MANIFEST_FILE}`);
    return;
  }

  let manifest: ReleaseBundleManifest;
  try {
    manifest = JSON.parse(manifestText) as ReleaseBundleManifest;
  } catch (error) {
    issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} is not valid JSON: ${(error as Error).message}`);
    return;
  }

  if (manifest.packageName !== RELEASE_BUNDLE_FOLDER_NAME) {
    issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} packageName must be ${RELEASE_BUNDLE_FOLDER_NAME}`);
  }
  if (manifest.manifestVersion !== VERSION) {
    issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} manifestVersion must be ${VERSION}`);
  }
  if (manifest.modFolder !== `mod/${MOD_FOLDER_NAME}`) {
    issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} modFolder must be mod/${MOD_FOLDER_NAME}`);
  }
  if (manifest.skillFolder !== `skill/${SKILL_FOLDER_NAME}`) {
    issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} skillFolder must be skill/${SKILL_FOLDER_NAME}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} must list bundle files`);
    return;
  }

  const actualFiles = await buildManifestFiles(bundleDir);
  const actualByPath = new Map(actualFiles.map((file) => [file.path, file]));
  const declaredPaths = new Set<string>();

  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string") {
      issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} contains a file entry without path`);
      continue;
    }
    declaredPaths.add(file.path);
    const actual = actualByPath.get(file.path);
    if (!actual) {
      issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} lists missing file: ${file.path}`);
      continue;
    }
    if (file.sizeBytes !== actual.sizeBytes) {
      issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} size mismatch for ${file.path}`);
    }
    if (file.sha256 !== actual.sha256) {
      issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} sha256 mismatch for ${file.path}`);
    }
  }

  for (const actual of actualFiles) {
    if (!declaredPaths.has(actual.path)) {
      issues.push(`${RELEASE_BUNDLE_MANIFEST_FILE} is missing file entry: ${actual.path}`);
    }
  }
}

async function buildManifestFiles(bundleDir: string): Promise<ReleaseBundleManifestFile[]> {
  const files = await listFiles(bundleDir);
  const manifestFiles: ReleaseBundleManifestFile[] = [];
  for (const relativePath of files) {
    if (relativePath === RELEASE_BUNDLE_MANIFEST_FILE) {
      continue;
    }
    const absolutePath = path.join(bundleDir, relativePath);
    const [fileStat, content] = await Promise.all([stat(absolutePath), readFile(absolutePath)]);
    manifestFiles.push({
      path: relativePath,
      sizeBytes: fileStat.size,
      sha256: createHash("sha256").update(content).digest("hex")
    });
  }
  return manifestFiles.sort((a, b) => a.path.localeCompare(b.path));
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
