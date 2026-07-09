import { readFile } from "node:fs/promises";
import { assembleLatestCompleteExport, diagnoseLogContent, parseLogContent } from "./parser.js";
import { writeSnapshotOutputs, type WrittenSnapshot } from "./writer.js";
import { validateSnapshotObject, type SnapshotValidationResult } from "../../snapshot/src/validate.js";
import type { LogDiagnosticReport } from "./protocol.js";

export interface BridgeRunOptions {
  inputLog: string;
  outputDir: string;
  allowInvalid?: boolean;
  diagnoseOnly?: boolean;
  skipExportId?: string;
}

export type BridgeRunResult =
  | {
      ok: boolean;
      diagnostics: LogDiagnosticReport;
      diagnoseOnly: true;
      exitCode: number;
    }
  | {
      ok: true;
      exportId: string;
      skipped: true;
      reason: "already-written";
      diagnostics: LogDiagnosticReport;
      exitCode: 0;
    }
  | {
      ok: boolean;
      exportId: string;
      validation: SnapshotValidationResult;
      written?: WrittenSnapshot;
      diagnostics: LogDiagnosticReport;
      exitCode: number;
    }
  | {
      ok: false;
      error: string;
      diagnostics?: LogDiagnosticReport;
      exitCode: number;
    };

export interface BridgeWatchOptions extends BridgeRunOptions {
  intervalMs: number;
  maxIterations?: number;
  onResult?: (result: BridgeRunResult) => void;
}

export interface BridgeWatchSummary {
  iterations: number;
  lastExportId?: string;
}

export async function runBridgeOnce(options: BridgeRunOptions): Promise<BridgeRunResult> {
  let diagnostics: LogDiagnosticReport | undefined;

  try {
    const logContent = await readFile(options.inputLog, "utf8");
    diagnostics = diagnoseLogContent(logContent);

    if (options.diagnoseOnly) {
      return {
        ok: diagnostics.issues.length === 0,
        diagnostics,
        diagnoseOnly: true,
        exitCode: diagnostics.issues.length === 0 ? 0 : 1
      };
    }

    const parsedExports = parseLogContent(logContent);
    const assembled = assembleLatestCompleteExport(parsedExports);
    if (options.skipExportId && assembled.exportId === options.skipExportId) {
      return {
        ok: true,
        exportId: assembled.exportId,
        skipped: true,
        reason: "already-written",
        diagnostics,
        exitCode: 0
      };
    }

    const validation = await validateSnapshotObject(assembled.snapshot);
    if (!validation.ok && !options.allowInvalid) {
      return {
        ok: false,
        exportId: assembled.exportId,
        validation,
        diagnostics,
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
      exitCode: validation.ok || options.allowInvalid ? 0 : 2
    };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
      diagnostics,
      exitCode: 1
    };
  }
}

export async function watchBridge(options: BridgeWatchOptions): Promise<BridgeWatchSummary> {
  let iterations = 0;
  let lastExportId = options.skipExportId;

  while (options.maxIterations === undefined || iterations < options.maxIterations) {
    iterations += 1;
    const result = await runBridgeOnce({
      ...options,
      skipExportId: lastExportId
    });

    if ("exportId" in result && (("written" in result && result.written) || ("skipped" in result && result.skipped))) {
      lastExportId = result.exportId;
    }
    options.onResult?.(result);

    if (options.maxIterations !== undefined && iterations >= options.maxIterations) {
      break;
    }

    await sleep(options.intervalMs);
  }

  return {
    iterations,
    lastExportId
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
