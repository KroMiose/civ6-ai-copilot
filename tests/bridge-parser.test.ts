import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { watchBridge, type BridgeRunResult } from "../tools/bridge/src/bridge.js";
import {
  assembleExport,
  assembleLatestCompleteExport,
  buildSnapshotLogLines,
  buildSnapshotLogLinesWithCompletionDiagnostic,
  diagnoseLogContent,
  parseLogContent
} from "../tools/bridge/src/parser.js";
import { writeSnapshotOutputs } from "../tools/bridge/src/writer.js";
import { PROTOCOL_VERSION, SCHEMA_VERSION, VERSION } from "../tools/project/src/version.js";
import { SNAPSHOT_BEGIN, SNAPSHOT_CHUNK, SNAPSHOT_END } from "../tools/bridge/src/protocol.js";

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
    'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true}',
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
    'CIV6_AI_COPILOT_DIAGNOSTIC {"reason":"loaded","base64SelfTest":true}',
    ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, { exportId: "diag-complete-export", chunkSize: 256 })
  ];

  const diagnostics = diagnoseLogContent(lines.join("\n"));
  const completion = diagnostics.latestExportCompletionDiagnostic?.payload;
  assert.equal(diagnostics.completeExportCount, 1);
  assert.equal(diagnostics.exportCompletionDiagnostics.length, 1);
  assert.equal(completion?.reason, "exported");
  assert.equal(completion?.exportId, "diag-complete-export");
  assert.equal(typeof completion?.chunkCount, "number");
  assert.equal(typeof completion?.byteLength, "number");
  assert.equal("checksumSha256" in (completion ?? {}), false);
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

test("bridge parser rejects missing END markers and out-of-range chunk indexes", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = buildSnapshotLogLines(snapshot, { exportId: "bad-framing-export", chunkSize: 128 });
  const withoutEnd = lines.filter((line) => !line.includes(SNAPSHOT_END));
  assert.throws(
    () => assembleLatestCompleteExport(parseLogContent(withoutEnd.join("\n"))),
    /No complete civ6-ai-copilot snapshot export/
  );

  const outOfRange = lines.map((line) => {
    if (!line.includes(SNAPSHOT_CHUNK)) return line;
    const chunk = JSON.parse(line.slice(line.indexOf("{"))) as { exportId: string; index: number; data: string };
    chunk.index = Number.MAX_SAFE_INTEGER;
    return `${SNAPSHOT_CHUNK} ${JSON.stringify(chunk)}`;
  });
  assert.throws(() => assembleLatestCompleteExport(parseLogContent(outOfRange.join("\n"))), /out-of-range chunk index/);
});

test("bridge parser rejects duplicate chunk indexes", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = buildSnapshotLogLines(snapshot, { exportId: "duplicate-chunk-export", chunkSize: 128 });
  const chunkIndexes = lines.flatMap((line, index) => line.includes(SNAPSHOT_CHUNK) ? [index] : []);
  assert.ok(chunkIndexes.length > 1);
  lines[chunkIndexes[chunkIndexes.length - 1]] = lines[chunkIndexes[0]];

  assert.throws(() => assembleLatestCompleteExport(parseLogContent(lines.join("\n"))), /duplicate chunk index/);
});

test("bridge parser rejects incorrect byteLength", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = buildSnapshotLogLines(snapshot, { exportId: "wrong-byte-length-export", chunkSize: 128 }).map((line) => {
    if (!line.includes(SNAPSHOT_BEGIN)) return line;
    const begin = JSON.parse(line.slice(line.indexOf("{"))) as { byteLength: number };
    begin.byteLength += 1;
    return `${SNAPSHOT_BEGIN} ${JSON.stringify(begin)}`;
  });

  assert.throws(() => assembleLatestCompleteExport(parseLogContent(lines.join("\n"))), /byteLength mismatch/);
});

test("bridge parser rejects BEGIN identity/version mismatch and chunks after END", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = buildSnapshotLogLines(snapshot);
  const parsed = parseLogContent(lines.join("\n"))[0];
  parsed.begin.exportId = "different-export";
  assert.throws(() => assembleExport(parsed), /identity\/version/);
  parsed.begin.exportId = "fixture-export-0001";
  parsed.begin.schemaVersion = "0.1.0";
  assert.throws(() => assembleExport(parsed), /identity\/version/);
  assert.throws(() => assembleExport(parseLogContent([...lines, lines[1]].join("\n"))[0]), /chunk appeared after end/);
  const newer = buildSnapshotLogLines(snapshot, { exportId: "newer" });
  assert.throws(() => assembleLatestCompleteExport(parseLogContent([...lines, ...newer, newer[newer.length - 1]].join("\n"))), /duplicate end/);
});

test("bridge parser rejects invalid and non-canonical Base64", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const invalid = buildSnapshotLogLines(snapshot, { exportId: "invalid-base64-export", chunkSize: 128 }).map((line) => {
    if (!line.includes(SNAPSHOT_CHUNK)) return line;
    const chunk = JSON.parse(line.slice(line.indexOf("{"))) as { exportId: string; index: number; data: string };
    chunk.data = `!${chunk.data.slice(1)}`;
    return `${SNAPSHOT_CHUNK} ${JSON.stringify(chunk)}`;
  });
  assert.throws(() => assembleLatestCompleteExport(parseLogContent(invalid.join("\n"))), /invalid or non-canonical Base64/);

  const nonCanonical = buildSnapshotLogLines(snapshot, { exportId: "noncanonical-base64-export", chunkSize: 128 }).map((line) => {
    if (!line.includes(SNAPSHOT_CHUNK)) return line;
    const chunk = JSON.parse(line.slice(line.indexOf("{"))) as { exportId: string; index: number; data: string };
    if (chunk.data.endsWith("==")) {
      chunk.data = chunk.data.replace(/([A-Za-z0-9+/])==$/, (_match, character: string) => {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        return `${alphabet[alphabet.indexOf(character) + 1]}==`;
      });
    }
    return `${SNAPSHOT_CHUNK} ${JSON.stringify(chunk)}`;
  });
  assert.throws(() => assembleLatestCompleteExport(parseLogContent(nonCanonical.join("\n"))), /invalid or non-canonical Base64/);
});

test("bridge parser rejects invalid UTF-8 even when JSON framing is complete", () => {
  const exportId = "invalid-utf8-export";
  const lines = [
    `${SNAPSHOT_BEGIN} ${JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      exportId,
      schemaVersion: SCHEMA_VERSION,
      chunkCount: 1,
      byteLength: 2,
      encoding: "base64-json"
    })}`,
    `${SNAPSHOT_CHUNK} ${JSON.stringify({ exportId, index: 0, data: Buffer.from([0xc3, 0x28]).toString("base64") })}`,
    `${SNAPSHOT_END} ${JSON.stringify({ exportId })}`
  ];

  assert.throws(() => assembleLatestCompleteExport(parseLogContent(lines.join("\n"))), /not valid UTF-8/);
});

test("bridge parser rejects valid UTF-8 that does not contain JSON", () => {
  const exportId = "invalid-json-export";
  const jsonBytes = Buffer.from("not-json", "utf8");
  const lines = [
    `${SNAPSHOT_BEGIN} ${JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      exportId,
      schemaVersion: SCHEMA_VERSION,
      chunkCount: 1,
      byteLength: jsonBytes.byteLength,
      encoding: "base64-json"
    })}`,
    `${SNAPSHOT_CHUNK} ${JSON.stringify({ exportId, index: 0, data: jsonBytes.toString("base64") })}`,
    `${SNAPSHOT_END} ${JSON.stringify({ exportId })}`
  ];

  assert.throws(() => assembleLatestCompleteExport(parseLogContent(lines.join("\n"))), /not valid JSON/);
});

test("bridge parser rejects unsupported protocol versions and duplicate END markers", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const lines = buildSnapshotLogLines(snapshot, { exportId: "wrong-version-export", chunkSize: 128 });
  const wrongVersion = lines.map((line) => {
    if (!line.includes(SNAPSHOT_BEGIN)) return line;
    const begin = JSON.parse(line.slice(line.indexOf("{"))) as { protocolVersion: string };
    begin.protocolVersion = "0.1.0";
    return `${SNAPSHOT_BEGIN} ${JSON.stringify(begin)}`;
  });
  assert.throws(() => parseLogContent(wrongVersion.join("\n")), /invalid CIV6_AI_COPILOT_SNAPSHOT_BEGIN payload shape/);

  const duplicateEnd = [...lines, lines.find((line) => line.includes(SNAPSHOT_END)) as string];
  const parsedDuplicateEnd = parseLogContent(duplicateEnd.join("\n"));
  assert.match(parsedDuplicateEnd[0].issues.join(" "), /duplicate end/);
  assert.throws(() => assembleExport(parsedDuplicateEnd[0]), /duplicate end/);
});

test("writer emits session snapshot, latest snapshot, and manifest", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const logContent = buildSnapshotLogLines(snapshot, { exportId: "write-export", chunkSize: 128 }).join("\n");
  const assembled = assembleLatestCompleteExport(parseLogContent(logContent));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-test-"));

  try {
    const written = await writeSnapshotOutputs(assembled.snapshot, outputDir, {
      exportId: assembled.exportId
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

test("writer manifest fingerprint matches latest.json independent of transport formatting", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-compact-writer-"));
  try {
    const written = await writeSnapshotOutputs(snapshot, outputDir, {
      exportId: "compact-writer-export"
    });
    const latestText = await readFile(written.latestPath, "utf8");
    const manifest = JSON.parse(await readFile(written.manifestPath, "utf8"));

    assert.equal(
      manifest.checksumSha256,
      createHash("sha256").update(Buffer.from(latestText, "utf8")).digest("hex")
    );
    assert.equal(manifest.checksumScope, "latest-json-file");
    assert.equal("transportChecksumSha256" in manifest, false);
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
