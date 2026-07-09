import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { COMPAT_VERSION, SKILL_NAME, VERSION } from "../../project/src/version.js";

export const SKILL_FOLDER_NAME = SKILL_NAME;
export const SKILL_ENTRY_FILE = "SKILL.md";
export const SKILL_PACKAGE_MANIFEST_FILE = "civ6-ai-copilot-skill-package-manifest.json";
export const SKILL_PACKAGE_CHECKLIST_FILE = "civ6-ai-copilot-skill-install-checklist.md";

export interface SkillPackageValidation {
  ok: boolean;
  issues: string[];
  files: string[];
}

export interface CreateSkillPackageOptions {
  sourceDir: string;
  outputDir: string;
  clean?: boolean;
}

export interface CreateSkillPackageResult {
  packageDir: string;
  validation: SkillPackageValidation;
}

export interface InstallSkillOptions {
  sourceDir: string;
  skillsDir?: string;
  clean?: boolean;
}

export interface InstallSkillResult {
  targetDir: string;
  validation: SkillPackageValidation;
}

export interface SkillPackageManifestFile {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface SkillPackageManifest {
  packageName: string;
  manifestVersion: string;
  skillName: string;
  skillVersion: string;
  compatVersion: string;
  entryFile: string;
  installFolderName: string;
  generatedAt: string;
  files: SkillPackageManifestFile[];
}

const requiredFiles = [
  SKILL_ENTRY_FILE,
  "agents/openai.yaml",
  "references/in-game-briefing-guide.md",
  "references/mod-usage-guide.md",
  "references/multiplayer-fairness.md",
  "references/snapshot-schema.md",
  "references/sync-module-guide.md",
  "scripts/suggest-sync.mjs"
];

const requiredSuggestSyncMarkers = [
  "export function inferRequiredModules",
  "export function buildSyncSuggestion",
  "visibleMap",
  "diplomacyPublic",
  "左上副官入口",
  "简报已汇总"
];

export async function validateSkillSource(sourceDir: string): Promise<SkillPackageValidation> {
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

  await validateSkillMarkdown(sourceDir, issues);
  await validateOpenAiMetadata(sourceDir, issues);
  await validateReferenceMarkers(sourceDir, "scripts/suggest-sync.mjs", requiredSuggestSyncMarkers, issues);

  return {
    ok: issues.length === 0,
    issues,
    files
  };
}

export async function createSkillPackageDirectory(
  options: CreateSkillPackageOptions
): Promise<CreateSkillPackageResult> {
  const packageDir = path.join(options.outputDir, SKILL_FOLDER_NAME);
  const validation = await validateSkillSource(options.sourceDir);
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
  await writeSkillPackageChecklist(packageDir);
  await writeSkillManifest(packageDir);

  return {
    packageDir,
    validation: await validatePackagedSkill(packageDir)
  };
}

export async function installSkill(options: InstallSkillOptions): Promise<InstallSkillResult> {
  const skillsDir = options.skillsDir ?? defaultCodexSkillsDir();
  const targetDir = path.join(skillsDir, SKILL_FOLDER_NAME);
  const validation = await validateSkillSource(options.sourceDir);
  if (!validation.ok) {
    return { targetDir, validation };
  }

  if (options.clean) {
    await rm(targetDir, { recursive: true, force: true });
  }
  await mkdir(skillsDir, { recursive: true });
  await cp(options.sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
  });

  return {
    targetDir,
    validation: await validatePackagedSkill(targetDir)
  };
}

export async function validatePackagedSkill(packageDir: string): Promise<SkillPackageValidation> {
  const validation = await validateSkillSource(packageDir);
  if (path.basename(packageDir) !== SKILL_FOLDER_NAME) {
    validation.issues.push(`installed skill folder should be named ${SKILL_FOLDER_NAME}`);
  }
  await validateSkillManifestIfPresent(packageDir, validation.issues);
  validation.ok = validation.issues.length === 0;
  return validation;
}

export function defaultCodexSkillsDir(
  env: NodeJS.ProcessEnv = process.env,
  homeDir = os.homedir()
): string {
  const codexHome = env.CODEX_HOME && env.CODEX_HOME.trim().length > 0
    ? env.CODEX_HOME
    : path.join(homeDir, ".codex");
  return path.join(codexHome, "skills");
}

async function validateSkillMarkdown(sourceDir: string, issues: string[]): Promise<void> {
  let skill = "";
  try {
    skill = await readFile(path.join(sourceDir, SKILL_ENTRY_FILE), "utf8");
  } catch {
    return;
  }

  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) {
    issues.push(`${SKILL_ENTRY_FILE} must start with YAML frontmatter`);
    return;
  }
  const frontmatterText = frontmatter[1] ?? "";
  const name = frontmatterText.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatterText.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  const version = frontmatterText.match(/^version:\s*(.+)$/m)?.[1]?.trim();
  const compatVersion = frontmatterText.match(/^compatVersion:\s*"?([^"\n]+)"?$/m)?.[1]?.trim();
  if (name !== SKILL_FOLDER_NAME) {
    issues.push(`${SKILL_ENTRY_FILE} frontmatter name must be ${SKILL_FOLDER_NAME}`);
  }
  if (version !== VERSION) {
    issues.push(`${SKILL_ENTRY_FILE} frontmatter version must be ${VERSION}`);
  }
  if (compatVersion !== COMPAT_VERSION) {
    issues.push(`${SKILL_ENTRY_FILE} frontmatter compatVersion must be ${COMPAT_VERSION}`);
  }
  if (!description) {
    issues.push(`${SKILL_ENTRY_FILE} frontmatter description is required`);
  }
}

async function validateOpenAiMetadata(sourceDir: string, issues: string[]): Promise<void> {
  let metadata = "";
  try {
    metadata = await readFile(path.join(sourceDir, "agents/openai.yaml"), "utf8");
  } catch {
    return;
  }

  if (!/^name:\s*civ6-ai-copilot$/m.test(metadata)) {
    issues.push("agents/openai.yaml must declare name: civ6-ai-copilot");
  }
  if (!new RegExp(`^version:\\s*${escapeRegExp(VERSION)}$`, "m").test(metadata)) {
    issues.push(`agents/openai.yaml must declare version: ${VERSION}`);
  }
  if (!new RegExp(`^compatVersion:\\s*"?${escapeRegExp(COMPAT_VERSION)}"?$`, "m").test(metadata)) {
    issues.push(`agents/openai.yaml must declare compatVersion: "${COMPAT_VERSION}"`);
  }
  if (!/^entry:\s*SKILL\.md$/m.test(metadata)) {
    issues.push("agents/openai.yaml must declare entry: SKILL.md");
  }
}

async function validateReferenceMarkers(
  sourceDir: string,
  relativePath: string,
  markers: string[],
  issues: string[]
): Promise<void> {
  let content = "";
  try {
    content = await readFile(path.join(sourceDir, relativePath), "utf8");
  } catch {
    return;
  }

  for (const marker of markers) {
    if (!content.includes(marker)) {
      issues.push(`${relativePath} must include marker: ${marker}`);
    }
  }
}

async function writeSkillManifest(packageDir: string): Promise<void> {
  const files = await buildManifestFiles(packageDir);
  const manifest: SkillPackageManifest = {
    packageName: SKILL_FOLDER_NAME,
    manifestVersion: VERSION,
    skillName: SKILL_FOLDER_NAME,
    skillVersion: VERSION,
    compatVersion: COMPAT_VERSION,
    entryFile: SKILL_ENTRY_FILE,
    installFolderName: SKILL_FOLDER_NAME,
    generatedAt: new Date().toISOString(),
    files
  };
  await writeFile(
    path.join(packageDir, SKILL_PACKAGE_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

async function writeSkillPackageChecklist(packageDir: string): Promise<void> {
  const checklist = [
    "# civ6-ai-copilot skill install checklist",
    "",
    "This generated checklist travels with the skill package and lists the minimum install and validation steps.",
    "",
    "## Package",
    "",
    `- Folder name: ${SKILL_FOLDER_NAME}`,
    `- Entry: ${SKILL_ENTRY_FILE}`,
    `- Manifest: ${SKILL_PACKAGE_MANIFEST_FILE}`,
    "",
    "## Install or update",
    "",
    "For Codex, Claude Code, or another Agent client, install this folder as a user-level Agent Skill named `civ6-ai-copilot`. Current Codex installations commonly scan `$HOME/.agents/skills`; some Codex desktop/tooling setups use `${CODEX_HOME:-$HOME/.codex}/skills`. Claude Code users should use the skills directory configured by Claude Code, commonly `$HOME/.claude/skills`.",
    "",
    "From the project checkout or release bundle tooling directory, you can install to the tooling default:",
    "",
    "```bash",
    "npm run skill:install -- --clean",
    "npm run skill:validate-installed",
    "```",
    "",
    "If your Agent uses a different skills directory, pass it explicitly:",
    "",
    "```bash",
    "npm run skill:install -- --skills-dir \"<skills-dir>\" --clean",
    "npm run skill:validate-installed -- --skills-dir \"<skills-dir>\"",
    "```",
    "",
    "Manual fallback: copy this whole folder to the target skills directory:",
    "",
    "```text",
    "<skills-dir>/civ6-ai-copilot/",
    "```",
    "",
    `Confirm ${SKILL_ENTRY_FILE} is directly inside civ6-ai-copilot, not nested one level deeper.`,
    "",
    "## Validate",
    "",
    "From the project checkout, run:",
    "",
    "```bash",
    "npm run skill:validate",
    "npm run skill:validate-installed",
    "npm run suggest-sync -- --intent war",
    "npm run preflight -- --snapshot-dir \"<snapshot-dir>\" --intent war",
    "```",
    "",
    "## Expected behavior",
    "",
    "- The skill must prefer Mod snapshot, handoff, preflight, summarize, suggest-sync, and doctor outputs over blind analysis.",
    "- If war/map/policy/city data is missing, it should ask the player to open the Civ6 AI briefing panel and sync exact modules.",
    "- It must keep multiplayer advice limited to local-player visible information.",
    "- It must treat doctor failures, manifest mismatches, or reason=\"exported\" mismatches as sync blockers.",
    "- If the user asks to install or update the skill, it should download the latest GitHub Release or repository skill folder, replace the old skill folder, and report version plus compatVersion.",
    "",
    "## Safety",
    "",
    "- Package only the skill files, references, scripts, manifest, and checklist generated by this tool.",
    "- Do not ask users to export hidden map, invisible units, unmet players, or other players' private state.",
    ""
  ].join("\n");
  await writeFile(path.join(packageDir, SKILL_PACKAGE_CHECKLIST_FILE), checklist, "utf8");
}

async function validateSkillManifestIfPresent(packageDir: string, issues: string[]): Promise<void> {
  const manifestPath = path.join(packageDir, SKILL_PACKAGE_MANIFEST_FILE);
  let manifestText = "";
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    return;
  }

  let manifest: SkillPackageManifest;
  try {
    manifest = JSON.parse(manifestText) as SkillPackageManifest;
  } catch (error) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} is not valid JSON: ${(error as Error).message}`);
    return;
  }

  if (manifest.packageName !== SKILL_FOLDER_NAME) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} packageName must be ${SKILL_FOLDER_NAME}`);
  }
  if (manifest.manifestVersion !== VERSION) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} manifestVersion must be ${VERSION}`);
  }
  if (manifest.skillName !== SKILL_FOLDER_NAME) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} skillName must be ${SKILL_FOLDER_NAME}`);
  }
  if (manifest.skillVersion !== VERSION) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} skillVersion must be ${VERSION}`);
  }
  if (manifest.compatVersion !== COMPAT_VERSION) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} compatVersion must be ${COMPAT_VERSION}`);
  }
  if (manifest.entryFile !== SKILL_ENTRY_FILE) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} entryFile must be ${SKILL_ENTRY_FILE}`);
  }
  if (manifest.installFolderName !== SKILL_FOLDER_NAME) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} installFolderName must be ${SKILL_FOLDER_NAME}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} must list package files`);
    return;
  }

  const actualFiles = await buildManifestFiles(packageDir);
  const actualByPath = new Map(actualFiles.map((file) => [file.path, file]));
  const declaredPaths = new Set<string>();

  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string") {
      issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} contains a file entry without path`);
      continue;
    }
    declaredPaths.add(file.path);
    const actual = actualByPath.get(file.path);
    if (!actual) {
      issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} lists missing file: ${file.path}`);
      continue;
    }
    if (file.sizeBytes !== actual.sizeBytes) {
      issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} size mismatch for ${file.path}`);
    }
    if (file.sha256 !== actual.sha256) {
      issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} sha256 mismatch for ${file.path}`);
    }
  }

  for (const actual of actualFiles) {
    if (!declaredPaths.has(actual.path)) {
      issues.push(`${SKILL_PACKAGE_MANIFEST_FILE} is missing file entry: ${actual.path}`);
    }
  }
}

async function buildManifestFiles(packageDir: string): Promise<SkillPackageManifestFile[]> {
  const files = await listFiles(packageDir);
  const manifestFiles: SkillPackageManifestFile[] = [];
  for (const relativePath of files) {
    if (relativePath === SKILL_PACKAGE_MANIFEST_FILE) {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
