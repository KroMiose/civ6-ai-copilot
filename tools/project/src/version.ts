import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ProjectVersionInfo {
  projectName: string;
  displayName: string;
  chineseDisplayName: string;
  version: string;
  compatVersion: string;
  schemaVersion: string;
  protocolVersion: string;
  workshopVersion: number;
  modId: string;
  modGuid: string;
  modFolderName: string;
  skillName: string;
  luaStateName: string;
  logMarkerPrefix: string;
}

const cwdVersionPath = path.resolve("project-version.json");
const sourceVersionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../project-version.json");
const versionPath = existsSync(cwdVersionPath) ? cwdVersionPath : sourceVersionPath;

export const projectVersion = JSON.parse(readFileSync(versionPath, "utf8")) as ProjectVersionInfo;

export const PROJECT_NAME = projectVersion.projectName;
export const DISPLAY_NAME = projectVersion.displayName;
export const CHINESE_DISPLAY_NAME = projectVersion.chineseDisplayName;
export const VERSION = projectVersion.version;
export const COMPAT_VERSION = projectVersion.compatVersion;
export const SCHEMA_VERSION = projectVersion.schemaVersion;
export const PROTOCOL_VERSION = projectVersion.protocolVersion;
export const WORKSHOP_VERSION = projectVersion.workshopVersion;
export const MOD_ID = projectVersion.modId;
export const MOD_GUID = projectVersion.modGuid;
export const MOD_FOLDER_NAME_FROM_VERSION = projectVersion.modFolderName;
export const SKILL_NAME = projectVersion.skillName;
export const LUA_STATE_NAME = projectVersion.luaStateName;
export const LOG_MARKER_PREFIX = projectVersion.logMarkerPrefix;

export function compatFromVersion(version: string): string | undefined {
  const match = version.match(/^(\d+)\.(\d+)\.\d+(?:[-+].*)?$/);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

export function versionMatchesCompat(version: string, compatVersion = COMPAT_VERSION): boolean {
  return compatFromVersion(version) === compatVersion;
}
