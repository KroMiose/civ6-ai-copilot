import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { watchBridge, type BridgeRunResult } from "../tools/bridge/src/bridge.js";
import {
  assembleLatestCompleteExport,
  buildSnapshotLogLines,
  buildSnapshotLogLinesWithCompletionDiagnostic,
  diagnoseLogContent,
  parseLogContent
} from "../tools/bridge/src/parser.js";
import { writeSnapshotOutputs } from "../tools/bridge/src/writer.js";
import { VERSION } from "../tools/project/src/version.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("bridge parser assembles a complete Lua.log chunk export", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const logContent = buildSnapshotLogLines(snapshot, { exportId: "test-export", chunkSize: 128 }).join("\n");

  const parsed = parseLogContent(logContent);
  const assembled = assembleLatestCompleteExport(parsed);
  const expected = {
    ...snapshot,
    source: {
      ...snapshot.source,
      exportId: "test-export"
    }
  };

  assert.equal(assembled.exportId, "test-export");
  assert.deepEqual(assembled.snapshot, expected);
});

test("bridge diagnostics report loaded marker, diagnostic payload, and incomplete exports", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = [
    `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
    'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","sha256SelfTest":true}',
    ...buildSnapshotLogLines(snapshot, { exportId: "diag-export", chunkSize: 256 }).slice(0, -1)
  ];

  const diagnostics = diagnoseLogContent(lines.join("\n"));
  assert.deepEqual(diagnostics.loadedLines, [1]);
  assert.equal(diagnostics.diagnostics[0].payload.reason, "loaded");
  assert.equal(diagnostics.exportCount, 1);
  assert.equal(diagnostics.incompleteExportCount, 1);
  assert.equal(diagnostics.exportCompletionDiagnostics.length, 0);
  assert.equal(diagnostics.issues.some((issue) => issue.includes("has no CIV6_AI_COPILOT_SNAPSHOT_END")), true);
});

test("bridge diagnostics report export completion markers", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = [
    `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
    'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","sha256SelfTest":true}',
    ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, { exportId: "diag-complete-export", chunkSize: 256 })
  ];

  const diagnostics = diagnoseLogContent(lines.join("\n"));
  const completion = diagnostics.latestExportCompletionDiagnostic?.payload;
  assert.equal(diagnostics.completeExportCount, 1);
  assert.equal(diagnostics.exportCompletionDiagnostics.length, 1);
  assert.equal(completion?.reason, "exported");
  assert.equal(completion?.exportId, "diag-complete-export");
  assert.equal(typeof completion?.chunkCount, "number");
  assert.equal(typeof completion?.checksumSha256, "string");
});

test("bridge parser rejects missing chunks", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = buildSnapshotLogLines(snapshot, { exportId: "missing-chunk-export", chunkSize: 128 });
  const withoutFirstChunk = lines.filter((line) => !line.includes('"index":0'));

  assert.throws(
    () => assembleLatestCompleteExport(parseLogContent(withoutFirstChunk.join("\n"))),
    /expected .* chunks but found/
  );
});

test("bridge parser rejects checksum mismatches", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = buildSnapshotLogLines(snapshot, { exportId: "checksum-export", chunkSize: 128 });
  const tampered = lines.map((line) =>
    line.includes("CIV6_AI_COPILOT_SNAPSHOT_BEGIN")
      ? line.replace(/"checksumSha256":"[a-f0-9]+"/, '"checksumSha256":"0000000000000000000000000000000000000000000000000000000000000000"')
      : line
  );

  assert.throws(() => assembleLatestCompleteExport(parseLogContent(tampered.join("\n"))), /checksum mismatch/);
});

test("writer emits session snapshot, latest snapshot, and manifest", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const logContent = buildSnapshotLogLines(snapshot, { exportId: "write-export", chunkSize: 128 }).join("\n");
  const assembled = assembleLatestCompleteExport(parseLogContent(logContent));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-test-"));

  try {
    const written = await writeSnapshotOutputs(assembled.snapshot, outputDir, {
      exportId: assembled.exportId,
      checksumSha256: assembled.checksumSha256
    });
    const latest = JSON.parse(await readFile(written.latestPath, "utf8"));
    const manifest = JSON.parse(await readFile(written.manifestPath, "utf8"));

    assert.deepEqual(latest, withExportId(snapshot, "write-export"));
    assert.equal(manifest.exportId, "write-export");
    assert.match(written.snapshotPath, /fixture-session/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("writer manifest checksum matches the written latest.json when transport JSON was compact", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-compact-writer-"));
  const compactTransportText = `${JSON.stringify(snapshot)}\n`;
  const transportChecksumSha256 = createHash("sha256").update(Buffer.from(compactTransportText, "utf8")).digest("hex");

  try {
    const written = await writeSnapshotOutputs(snapshot, outputDir, {
      exportId: "compact-writer-export",
      checksumSha256: transportChecksumSha256
    });
    const latestText = await readFile(written.latestPath, "utf8");
    const manifest = JSON.parse(await readFile(written.manifestPath, "utf8"));

    assert.equal(
      manifest.checksumSha256,
      createHash("sha256").update(Buffer.from(latestText, "utf8")).digest("hex")
    );
    assert.equal(manifest.transportChecksumSha256, transportChecksumSha256);
    assert.notEqual(manifest.checksumSha256, manifest.transportChecksumSha256);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("bridge watch writes a new export once and skips the same export on the next poll", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-watch-output-"));
  const logDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-watch-log-"));
  const logPath = path.join(logDir, "Lua.log");
  const results: BridgeRunResult[] = [];

  try {
    await writeFile(logPath, buildSnapshotLogLines(snapshot, { exportId: "watch-export", chunkSize: 128 }).join("\n"));
    const summary = await watchBridge({
      inputLog: logPath,
      outputDir,
      intervalMs: 1,
      maxIterations: 2,
      onResult: (result) => results.push(result)
    });

    assert.equal(summary.iterations, 2);
    assert.equal(summary.lastExportId, "watch-export");
    assert.equal(results.length, 2);
    assert.equal(results[0].ok, true);
    assert.equal("written" in results[0], true);
    assert.equal("skipped" in results[1] && results[1].skipped, true);

    const latest = JSON.parse(await readFile(path.join(outputDir, "latest.json"), "utf8"));
    assert.deepEqual(latest, withExportId(snapshot, "watch-export"));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(logDir, { recursive: true, force: true });
  }
});

function withExportId(snapshot: Record<string, unknown>, exportId: string): Record<string, unknown> {
  return {
    ...snapshot,
    source: {
      ...(snapshot.source as Record<string, unknown>),
      exportId
    }
  };
}
