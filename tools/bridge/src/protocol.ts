import { LOG_MARKER_PREFIX, PROTOCOL_VERSION } from "../../project/src/version.js";

export const SNAPSHOT_BEGIN = `${LOG_MARKER_PREFIX}_SNAPSHOT_BEGIN`;
export const SNAPSHOT_CHUNK = `${LOG_MARKER_PREFIX}_SNAPSHOT_CHUNK`;
export const SNAPSHOT_END = `${LOG_MARKER_PREFIX}_SNAPSHOT_END`;
export const COPILOT_LOADED = `${LOG_MARKER_PREFIX}_LOADED`;
export const COPILOT_DIAGNOSTIC = `${LOG_MARKER_PREFIX}_DIAGNOSTIC`;

export type SnapshotEncoding = "base64-json";

export interface SnapshotBegin {
  protocolVersion: typeof PROTOCOL_VERSION;
  exportId: string;
  schemaVersion: string;
  chunkCount: number;
  byteLength: number;
  checksumSha256: string;
  encoding: SnapshotEncoding;
  createdAt?: string;
}

export interface SnapshotChunk {
  exportId: string;
  index: number;
  data: string;
}

export interface SnapshotEnd {
  exportId: string;
}

export interface ParsedExport {
  begin: SnapshotBegin;
  chunks: SnapshotChunk[];
  end?: SnapshotEnd;
  lineNumbers: number[];
  issues: string[];
}

export interface AssembledSnapshot {
  exportId: string;
  checksumSha256: string;
  jsonText: string;
  snapshot: unknown;
}

export interface CopilotDiagnostic {
  lineNumber: number;
  payload: Record<string, unknown>;
}

export interface LogDiagnosticReport {
  loadedLines: number[];
  diagnostics: CopilotDiagnostic[];
  exportCompletionDiagnostics: CopilotDiagnostic[];
  latestExportCompletionDiagnostic?: CopilotDiagnostic;
  exportCount: number;
  completeExportCount: number;
  incompleteExportCount: number;
  latestExportId?: string;
  issues: string[];
}
