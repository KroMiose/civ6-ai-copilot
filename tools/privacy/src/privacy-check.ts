import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateSnapshotFile } from "../../snapshot/src/validate.js";

export type PrivacySeverity = "error" | "warning";

export interface PrivacyIssue {
  severity: PrivacySeverity;
  path: string;
  message: string;
}

export interface PrivacyCheckOptions {
  rootDir: string;
  homeDir?: string;
}

export interface PrivacyCheckResult {
  ok: boolean;
  issues: PrivacyIssue[];
  scannedFiles: number;
}

const ignoredDirectories = new Set([
  ".git",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "venv"
]);

const blockedExactNames = new Set([
  "Lua.log",
  "Database.log",
  "Modding.log",
  ".env"
]);

const blockedPrivateDirectories = new Set([
  "exports",
  "logs",
  "saves",
  "snapshots"
]);

const blockedFilePatterns = [
  /\.Civ6Save(?:\.bak)?$/i,
  /^\.env\./,
  /\.local$/i,
  /\.snapshot\.json$/i,
  /-snapshot\.json$/i,
  /^copilot-report.*\.md$/i,
  /^map-render.*\.(?:svg|png)$/i
];

const allowedSnapshotPrefixes = [
  "tests/fixtures/",
  "schemas/examples/"
];

const secretContentPatterns = [
  {
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
    message: "contains a private key block"
  },
  {
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
    message: "contains a likely OpenAI-style credential"
  },
  {
    pattern: /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY|SECRET|TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i,
    message: "contains a likely credential assignment"
  }
];

export async function runPrivacyCheck(options: PrivacyCheckOptions): Promise<PrivacyCheckResult> {
  const rootDir = path.resolve(options.rootDir);
  const homeDir = options.homeDir ?? os.homedir();
  const files = await listFiles(rootDir);
  const issues: PrivacyIssue[] = [];

  await checkGitignore(rootDir, issues);

  for (const filePath of files) {
    const relativePath = toPosix(path.relative(rootDir, filePath));
    const basename = path.basename(filePath);
    const pathParts = relativePath.split("/");

    if (blockedExactNames.has(basename) || blockedFilePatterns.some((pattern) => pattern.test(basename))) {
      if (!isAllowedSnapshot(relativePath)) {
        issues.push({
          severity: "error",
          path: relativePath,
          message: "file name matches a blocked private/generated artifact pattern"
        });
      }
    }

    if (pathParts.some((part) => blockedPrivateDirectories.has(part))) {
      issues.push({
        severity: "error",
        path: relativePath,
        message: "file is inside a blocked private game-state directory"
      });
    }

    if (/\.snapshot\.json$/i.test(basename) && isAllowedSnapshot(relativePath)) {
      try {
        const validation = await validateSnapshotFile(filePath);
        if (!validation.ok) {
          issues.push({
            severity: "error",
            path: relativePath,
            message: "allowed snapshot fixture failed schema/fairness validation"
          });
        }
      } catch (error) {
        issues.push({
          severity: "error",
          path: relativePath,
          message: `allowed snapshot fixture could not be validated: ${(error as Error).message}`
        });
      }
    }

    const content = await readTextIfSmall(filePath);
    if (content === undefined) {
      continue;
    }

    for (const { pattern, message } of secretContentPatterns) {
      if (pattern.test(content)) {
        issues.push({ severity: "error", path: relativePath, message });
      }
    }

    const homePathIssue = detectPersonalPath(content, homeDir);
    if (homePathIssue) {
      issues.push({
        severity: "error",
        path: relativePath,
        message: homePathIssue
      });
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
    scannedFiles: files.length
  };
}

async function listFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      files.push(...(await listFiles(rootDir, path.join(currentDir, entry.name))));
    } else if (entry.isFile()) {
      files.push(path.join(currentDir, entry.name));
    }
  }
  return files.sort();
}

async function readTextIfSmall(filePath: string): Promise<string | undefined> {
  const fileStat = await stat(filePath);
  if (fileStat.size > 1024 * 1024) {
    return undefined;
  }
  const buffer = await readFile(filePath);
  if (buffer.includes(0)) {
    return undefined;
  }
  return buffer.toString("utf8");
}

function isAllowedSnapshot(relativePath: string): boolean {
  return allowedSnapshotPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

async function checkGitignore(rootDir: string, issues: PrivacyIssue[]): Promise<void> {
  let gitignore = "";
  try {
    gitignore = await readFile(path.join(rootDir, ".gitignore"), "utf8");
  } catch {
    issues.push({ severity: "error", path: ".gitignore", message: ".gitignore is missing" });
    return;
  }

  for (const requiredPattern of ["*.Civ6Save", "Lua.log", "snapshots/", "*.snapshot.json"]) {
    if (!gitignore.includes(requiredPattern)) {
      issues.push({
        severity: "error",
        path: ".gitignore",
        message: `missing privacy ignore pattern: ${requiredPattern}`
      });
    }
  }
}

function detectPersonalPath(content: string, homeDir: string): string | undefined {
  const normalizedHome = toPosix(homeDir);
  if (normalizedHome && normalizedHome !== "/" && content.includes(normalizedHome)) {
    return `contains current user's home path: ${normalizedHome}`;
  }

  const currentUser = path.basename(homeDir);
  if (currentUser && currentUser !== "player" && currentUser !== "Player") {
    const escapedUser = escapeRegExp(currentUser);
    const windowsUserPattern = new RegExp(`C:\\\\Users\\\\${escapedUser}(?:\\\\|\\b)`, "i");
    if (windowsUserPattern.test(content)) {
      return `contains current user's Windows home path: C:\\Users\\${currentUser}`;
    }
  }

  return undefined;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
