import { assembleLatestCompleteExport, diagnoseLogContent, parseLogContent } from "../../bridge/src/parser.js";
import { writeSnapshotOutputs, type WrittenSnapshot } from "../../bridge/src/writer.js";
import { validateSnapshotObject, type SnapshotValidationResult } from "../../snapshot/src/validate.js";
import type { LogDiagnosticReport } from "../../bridge/src/protocol.js";
import { chooseDefaultState, TunerClient, type TunerConnectionInfo } from "./nexus-client.js";

export interface TunerBridgeOptions {
  outputDir: string;
  host?: string;
  ports?: number[];
  state?: string;
  timeoutMs?: number;
  allowInvalid?: boolean;
  diagnoseOnly?: boolean;
}

export interface TunerBridgeInfo extends TunerConnectionInfo {
  state: string;
}

export type TunerBridgeResult =
  | {
      ok: boolean;
      diagnostics: LogDiagnosticReport;
      diagnoseOnly: true;
      tuner: TunerBridgeInfo;
      exitCode: number;
    }
  | {
      ok: boolean;
      exportId: string;
      validation: SnapshotValidationResult;
      written?: WrittenSnapshot;
      diagnostics: LogDiagnosticReport;
      tuner: TunerBridgeInfo;
      exitCode: number;
    }
  | {
      ok: false;
      error: string;
      diagnostics?: LogDiagnosticReport;
      tuner?: TunerBridgeInfo;
      exitCode: number;
    };

const TUNER_ERROR_MARKER = "CIV6_AI_COPILOT_TUNER_ERROR";

const READ_CACHED_EXPORT_LUA = `
local ns = ExposedMembers and ExposedMembers.Civ6AICopilot or nil
local latest = ns and ns.latestExport or nil
if latest == nil then
  print('${TUNER_ERROR_MARKER} {"reason":"no-cached-export"}')
elseif latest.beginJson == nil or latest.chunkJsons == nil or latest.endJson == nil then
  print('${TUNER_ERROR_MARKER} {"reason":"malformed-cached-export"}')
else
  print("CIV6_AI_COPILOT_LOADED version=" .. tostring(latest.modVersion or "unknown") .. " transport=tuner-cache")
  print("CIV6_AI_COPILOT_SNAPSHOT_BEGIN " .. tostring(latest.beginJson))
  for index = 1, #latest.chunkJsons do
    print("CIV6_AI_COPILOT_SNAPSHOT_CHUNK " .. tostring(latest.chunkJsons[index]))
  end
  print("CIV6_AI_COPILOT_SNAPSHOT_END " .. tostring(latest.endJson))
  if latest.diagnosticJson ~= nil then
    print("CIV6_AI_COPILOT_DIAGNOSTIC " .. tostring(latest.diagnosticJson))
  end
end
`;

export async function runTunerBridgeOnce(options: TunerBridgeOptions): Promise<TunerBridgeResult> {
  let client: TunerClient | undefined;
  let tuner: TunerBridgeInfo | undefined;
  let diagnostics: LogDiagnosticReport | undefined;

  try {
    client = await TunerClient.connect({
      host: options.host,
      ports: options.ports,
      timeoutMs: options.timeoutMs,
      appName: "civ6-ai-copilot"
    });

    const state = options.state ?? chooseDefaultState(client.states);
    if (!state) {
      throw new Error("no Lua states were reported by the tuner socket");
    }
    tuner = {
      ...client.info(),
      state
    };

    const output = await client.run(state, READ_CACHED_EXPORT_LUA, {
      timeoutMs: options.timeoutMs
    });
    diagnostics = diagnoseLogContent(output);

    const tunerError = extractTunerError(output);
    if (tunerError) {
      return {
        ok: false,
        error: tunerError,
        diagnostics,
        tuner,
        exitCode: 1
      };
    }

    if (options.diagnoseOnly) {
      return {
        ok: diagnostics.issues.length === 0,
        diagnostics,
        diagnoseOnly: true,
        tuner,
        exitCode: diagnostics.issues.length === 0 ? 0 : 1
      };
    }

    const assembled = assembleLatestCompleteExport(parseLogContent(output));
    const validation = await validateSnapshotObject(assembled.snapshot);
    if (!validation.ok && !options.allowInvalid) {
      return {
        ok: false,
        exportId: assembled.exportId,
        validation,
        diagnostics,
        tuner,
        exitCode: 2
      };
    }

    const written = await writeSnapshotOutputs(assembled.snapshot, options.outputDir, {
      exportId: assembled.exportId,
      checksumSha256: assembled.checksumSha256
    });

    return {
      ok: validation.ok,
      exportId: assembled.exportId,
      validation,
      written,
      diagnostics,
      tuner,
      exitCode: validation.ok || options.allowInvalid ? 0 : 2
    };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
      diagnostics,
      tuner,
      exitCode: 1
    };
  } finally {
    client?.close();
  }
}

function extractTunerError(output: string): string | undefined {
  const line = output.split(/\r?\n/).find((candidate) => candidate.includes(TUNER_ERROR_MARKER));
  if (!line) {
    return undefined;
  }

  const jsonText = line.slice(line.indexOf(TUNER_ERROR_MARKER) + TUNER_ERROR_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonText) as { reason?: unknown };
    return `civ6-ai-copilot tuner cache unavailable: ${String(parsed.reason ?? "unknown")}`;
  } catch {
    return `civ6-ai-copilot tuner cache unavailable: ${jsonText || "unknown"}`;
  }
}
