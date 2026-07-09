import { createHash } from "node:crypto";
import {
  COPILOT_DIAGNOSTIC,
  COPILOT_LOADED,
  SNAPSHOT_BEGIN,
  SNAPSHOT_CHUNK,
  SNAPSHOT_END,
  type AssembledSnapshot,
  type CopilotDiagnostic,
  type LogDiagnosticReport,
  type ParsedExport,
  type SnapshotBegin,
  type SnapshotChunk,
  type SnapshotEnd
} from "./protocol.js";
import { PROTOCOL_VERSION, SCHEMA_VERSION, VERSION } from "../../project/src/version.js";

export class BridgeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BridgeParseError";
  }
}

type Marker = typeof SNAPSHOT_BEGIN | typeof SNAPSHOT_CHUNK | typeof SNAPSHOT_END | typeof COPILOT_DIAGNOSTIC;

const markers: Marker[] = [SNAPSHOT_BEGIN, SNAPSHOT_CHUNK, SNAPSHOT_END];

export interface BuildSnapshotLogLineOptions {
  exportId?: string;
  chunkSize?: number;
}

export function parseLogContent(content: string): ParsedExport[] {
  const exportsById = new Map<string, ParsedExport>();

  for (const [lineOffset, line] of content.split(/\r?\n/).entries()) {
    const lineNumber = lineOffset + 1;
    const marker = markers.find((candidate) => line.includes(candidate));
    if (!marker) {
      continue;
    }

    const payload = parseJsonAfterMarker(line, marker, lineNumber);
    if (marker === SNAPSHOT_BEGIN) {
      const begin = assertBegin(payload, lineNumber);
      const existing = exportsById.get(begin.exportId);
      if (existing) {
        existing.issues.push(`line ${lineNumber}: duplicate begin for exportId ${begin.exportId}`);
        continue;
      }
      exportsById.set(begin.exportId, {
        begin,
        chunks: [],
        lineNumbers: [lineNumber],
        issues: []
      });
      continue;
    }

    if (marker === SNAPSHOT_CHUNK) {
      const chunk = assertChunk(payload, lineNumber);
      const parsed = ensureExport(exportsById, chunk.exportId, lineNumber);
      parsed.chunks.push(chunk);
      parsed.lineNumbers.push(lineNumber);
      continue;
    }

    const end = assertEnd(payload, lineNumber);
    const parsed = ensureExport(exportsById, end.exportId, lineNumber);
    parsed.end = end;
    parsed.lineNumbers.push(lineNumber);
  }

  return [...exportsById.values()];
}

export function diagnoseLogContent(content: string): LogDiagnosticReport {
  const loadedLines: number[] = [];
  const diagnostics: CopilotDiagnostic[] = [];
  const issues: string[] = [];
  let parsedExports: ParsedExport[] = [];

  for (const [lineOffset, line] of content.split(/\r?\n/).entries()) {
    const lineNumber = lineOffset + 1;
    if (line.includes(COPILOT_LOADED)) {
      loadedLines.push(lineNumber);
    }
    if (line.includes(COPILOT_DIAGNOSTIC)) {
      try {
        const payload = parseJsonAfterMarker(line, COPILOT_DIAGNOSTIC, lineNumber);
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          diagnostics.push({ lineNumber, payload: payload as Record<string, unknown> });
        } else {
          issues.push(`line ${lineNumber}: ${COPILOT_DIAGNOSTIC} payload must be an object`);
        }
      } catch (error) {
        issues.push((error as Error).message);
      }
    }
  }

  try {
    parsedExports = parseLogContent(content);
  } catch (error) {
    issues.push((error as Error).message);
  }

  const completeExports = parsedExports.filter((candidate) => candidate.end && candidate.issues.length === 0);
  const sortedExports = [...parsedExports].sort((a, b) => Math.max(...a.lineNumbers) - Math.max(...b.lineNumbers));
  const latest = sortedExports[sortedExports.length - 1];
  const exportCompletionDiagnostics = diagnostics.filter((diagnostic) => diagnostic.payload.reason === "exported");
  const latestExportCompletionDiagnostic = exportCompletionDiagnostics[exportCompletionDiagnostics.length - 1];

  for (const parsed of parsedExports) {
    issues.push(...parsed.issues);
    if (!parsed.end) {
      issues.push(`export ${parsed.begin.exportId} has no ${SNAPSHOT_END} line`);
    }
    if (parsed.chunks.length !== parsed.begin.chunkCount) {
      issues.push(
        `export ${parsed.begin.exportId} expected ${parsed.begin.chunkCount} chunks but found ${parsed.chunks.length}`
      );
    }
  }

  return {
    loadedLines,
    diagnostics,
    exportCompletionDiagnostics,
    latestExportCompletionDiagnostic,
    exportCount: parsedExports.length,
    completeExportCount: completeExports.length,
    incompleteExportCount: parsedExports.length - completeExports.length,
    latestExportId: latest?.begin.exportId,
    issues
  };
}

export function assembleLatestCompleteExport(exports: ParsedExport[]): AssembledSnapshot {
  const complete = exports
    .filter((candidate) => candidate.end && candidate.issues.length === 0)
    .sort((a, b) => Math.max(...a.lineNumbers) - Math.max(...b.lineNumbers));

  if (complete.length === 0) {
    throw new BridgeParseError("No complete civ6-ai-copilot snapshot export found in log.");
  }

  return assembleExport(complete[complete.length - 1]);
}

export function assembleExport(parsed: ParsedExport): AssembledSnapshot {
  const { begin } = parsed;
  if (!parsed.end) {
    throw new BridgeParseError(`Export ${begin.exportId} has no ${SNAPSHOT_END} line.`);
  }

  if (parsed.issues.length > 0) {
    throw new BridgeParseError(`Export ${begin.exportId} has parse issues: ${parsed.issues.join("; ")}`);
  }

  if (parsed.chunks.length !== begin.chunkCount) {
    throw new BridgeParseError(
      `Export ${begin.exportId} expected ${begin.chunkCount} chunks but found ${parsed.chunks.length}.`
    );
  }

  const seen = new Set<number>();
  for (const chunk of parsed.chunks) {
    if (chunk.index < 0 || chunk.index >= begin.chunkCount) {
      throw new BridgeParseError(`Export ${begin.exportId} has out-of-range chunk index ${chunk.index}.`);
    }
    if (seen.has(chunk.index)) {
      throw new BridgeParseError(`Export ${begin.exportId} has duplicate chunk index ${chunk.index}.`);
    }
    seen.add(chunk.index);
  }

  const payloadBase64 = [...parsed.chunks]
    .sort((a, b) => a.index - b.index)
    .map((chunk) => chunk.data)
    .join("");

  const jsonBytes = Buffer.from(payloadBase64, "base64");
  if (jsonBytes.byteLength !== begin.byteLength) {
    throw new BridgeParseError(
      `Export ${begin.exportId} byteLength mismatch: expected ${begin.byteLength}, got ${jsonBytes.byteLength}.`
    );
  }

  const checksumSha256 = createHash("sha256").update(jsonBytes).digest("hex");
  if (checksumSha256 !== begin.checksumSha256) {
    throw new BridgeParseError(
      `Export ${begin.exportId} checksum mismatch: expected ${begin.checksumSha256}, got ${checksumSha256}.`
    );
  }

  const jsonText = jsonBytes.toString("utf8");
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(jsonText);
  } catch (error) {
    throw new BridgeParseError(
      `Export ${begin.exportId} decoded payload is not valid JSON: ${(error as Error).message}`
    );
  }

  return {
    exportId: begin.exportId,
    checksumSha256,
    jsonText,
    snapshot
  };
}

export function buildSnapshotLogLines(snapshot: unknown, options?: BuildSnapshotLogLineOptions): string[] {
  const exportId = options?.exportId ?? "fixture-export-0001";
  const snapshotForLog = withSnapshotExportId(snapshot, exportId);
  const jsonText = `${JSON.stringify(snapshotForLog, null, 2)}\n`;
  const jsonBytes = Buffer.from(jsonText, "utf8");
  const payloadBase64 = jsonBytes.toString("base64");
  const chunkSize = options?.chunkSize ?? 512;
  const chunks = payloadBase64.match(new RegExp(`.{1,${chunkSize}}`, "g")) ?? [];
  const begin: SnapshotBegin = {
    protocolVersion: PROTOCOL_VERSION,
    exportId,
    schemaVersion: SCHEMA_VERSION,
    chunkCount: chunks.length,
    byteLength: jsonBytes.byteLength,
    checksumSha256: createHash("sha256").update(jsonBytes).digest("hex"),
    encoding: "base64-json",
    createdAt: new Date(0).toISOString()
  };

  return [
    `${SNAPSHOT_BEGIN} ${JSON.stringify(begin)}`,
    ...chunks.map((data, index) => `${SNAPSHOT_CHUNK} ${JSON.stringify({ exportId, index, data })}`),
    `${SNAPSHOT_END} ${JSON.stringify({ exportId })}`
  ];
}

export function buildSnapshotLogLinesWithCompletionDiagnostic(
  snapshot: unknown,
  options?: BuildSnapshotLogLineOptions
): string[] {
  const lines = buildSnapshotLogLines(snapshot, options);
  const parsed = parseLogContent(lines.join("\n"));
  const begin = parsed[0]?.begin;
  if (!begin) {
    throw new BridgeParseError("Could not build completion diagnostic without a snapshot begin marker.");
  }
  return [...lines, buildExportCompletionDiagnosticLogLine(begin)];
}

export function buildExportCompletionDiagnosticLogLine(
  begin: SnapshotBegin,
  extra?: Record<string, unknown>
): string {
  return `${COPILOT_DIAGNOSTIC} ${JSON.stringify({
    modVersion: VERSION,
    protocolVersion: begin.protocolVersion,
    reason: "exported",
    exportId: begin.exportId,
    chunkCount: begin.chunkCount,
    byteLength: begin.byteLength,
    checksumSha256: begin.checksumSha256,
    emittedAt: new Date(0).toISOString(),
    ...extra
  })}`;
}

function withSnapshotExportId(snapshot: unknown, exportId: string): unknown {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return snapshot;
  }

  const cloned = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  const source = cloned.source && typeof cloned.source === "object" && !Array.isArray(cloned.source)
    ? (cloned.source as Record<string, unknown>)
    : {};
  cloned.source = {
    ...source,
    exportId
  };
  return cloned;
}

function parseJsonAfterMarker(line: string, marker: Marker, lineNumber: number): unknown {
  const markerIndex = line.indexOf(marker);
  const jsonPart = line.slice(markerIndex + marker.length).trim();
  if (!jsonPart) {
    throw new BridgeParseError(`line ${lineNumber}: ${marker} has no JSON payload.`);
  }

  try {
    return JSON.parse(jsonPart);
  } catch (error) {
    throw new BridgeParseError(`line ${lineNumber}: invalid ${marker} JSON payload: ${(error as Error).message}`);
  }
}

function ensureExport(exportsById: Map<string, ParsedExport>, exportId: string, lineNumber: number): ParsedExport {
  const parsed = exportsById.get(exportId);
  if (parsed) {
    return parsed;
  }

  const placeholder: ParsedExport = {
    begin: {
      protocolVersion: PROTOCOL_VERSION,
      exportId,
      schemaVersion: "unknown",
      chunkCount: 0,
      byteLength: 0,
      checksumSha256: "",
      encoding: "base64-json"
    },
    chunks: [],
    lineNumbers: [lineNumber],
    issues: [`line ${lineNumber}: chunk/end appeared before begin for exportId ${exportId}`]
  };
  exportsById.set(exportId, placeholder);
  return placeholder;
}

function assertBegin(value: unknown, lineNumber: number): SnapshotBegin {
  const payload = assertObject(value, lineNumber, SNAPSHOT_BEGIN);
  const begin = payload as Partial<SnapshotBegin>;
  if (
    begin.protocolVersion !== PROTOCOL_VERSION ||
    typeof begin.exportId !== "string" ||
    typeof begin.schemaVersion !== "string" ||
    typeof begin.chunkCount !== "number" ||
    typeof begin.byteLength !== "number" ||
    typeof begin.checksumSha256 !== "string" ||
    begin.encoding !== "base64-json"
  ) {
    throw new BridgeParseError(`line ${lineNumber}: invalid ${SNAPSHOT_BEGIN} payload shape.`);
  }
  return begin as SnapshotBegin;
}

function assertChunk(value: unknown, lineNumber: number): SnapshotChunk {
  const payload = assertObject(value, lineNumber, SNAPSHOT_CHUNK);
  const chunk = payload as Partial<SnapshotChunk>;
  if (typeof chunk.exportId !== "string" || typeof chunk.index !== "number" || typeof chunk.data !== "string") {
    throw new BridgeParseError(`line ${lineNumber}: invalid ${SNAPSHOT_CHUNK} payload shape.`);
  }
  return chunk as SnapshotChunk;
}

function assertEnd(value: unknown, lineNumber: number): SnapshotEnd {
  const payload = assertObject(value, lineNumber, SNAPSHOT_END);
  const end = payload as Partial<SnapshotEnd>;
  if (typeof end.exportId !== "string") {
    throw new BridgeParseError(`line ${lineNumber}: invalid ${SNAPSHOT_END} payload shape.`);
  }
  return end as SnapshotEnd;
}

function assertObject(value: unknown, lineNumber: number, marker: Marker): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BridgeParseError(`line ${lineNumber}: ${marker} payload must be an object.`);
  }
  return value as Record<string, unknown>;
}
