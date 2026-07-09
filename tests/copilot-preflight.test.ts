import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCopilotPreflight } from "../tools/copilot/src/preflight.js";
import { assembleLatestCompleteExport, buildSnapshotLogLines, parseLogContent } from "../tools/bridge/src/parser.js";
import { writeSnapshotOutputs } from "../tools/bridge/src/writer.js";
import { COMPAT_VERSION, VERSION } from "../tools/project/src/version.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("copilot preflight accepts a bridge-written snapshot with matching manifest", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-preflight-"));
  try {
    await writeFixtureBridgeOutput(outputDir, "fixture-export-0001");

    const report = await runCopilotPreflight({
      snapshotDir: outputDir,
      intents: ["war"]
    });

    assert.equal(report.canAnalyze, true, JSON.stringify(report, null, 2));
    assert.equal(report.exitCode, 0);
    assert.equal(report.checks.manifestFound, true);
    assert.equal(report.checks.manifestConsistent, true);
    assert.equal(report.checks.validationOk, true);
    assert.equal(report.checks.fairnessOk, true);
    assert.equal(report.checks.syncOk, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot preflight asks for panel sync when intent modules are missing", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-preflight-missing-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.modules = ["meta", "localPlayer", "cities"];
    await writeLatestWithManifest(outputDir, snapshot);

    const report = await runCopilotPreflight({
      snapshotDir: outputDir,
      intents: ["policy"]
    });

    assert.equal(report.canAnalyze, false);
    assert.equal(report.exitCode, 2);
    assert.equal(report.checks.syncOk, false);
    assert.deepEqual(report.summary?.syncAdvice.missingModules.sort(), ["government", "policies", "resources"].sort());
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot preflight asks for map visibility sync for exploration intent", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-preflight-explore-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.modules = ["meta", "localPlayer", "cities"];
    await writeLatestWithManifest(outputDir, snapshot);

    const report = await runCopilotPreflight({
      snapshotDir: outputDir,
      intents: ["exploration"]
    });

    assert.equal(report.canAnalyze, false);
    assert.equal(report.checks.syncOk, false);
    assert.equal(report.summary?.syncAdvice.missingModules.includes("visibleMap"), true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot preflight blocks stale snapshots by default", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-preflight-stale-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.exportedAt = new Date(Date.now() - 31 * 60000).toISOString();
    await writeLatestWithManifest(outputDir, snapshot, { refreshExportedAt: false });

    const report = await runCopilotPreflight({
      snapshotDir: outputDir,
      intents: ["war"]
    });

    assert.equal(report.canAnalyze, false);
    assert.equal(report.checks.freshnessOk, false);
    assert.equal(report.issues.length > 0, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot preflight treats low-confidence public diplomacy as not enough for war intent", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-preflight-low-diplomacy-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.diplomacy.confidence = "low";
    await writeLatestWithManifest(outputDir, snapshot);

    const report = await runCopilotPreflight({
      snapshotDir: outputDir,
      intents: ["war"]
    });

    assert.equal(report.canAnalyze, false);
    assert.equal(report.checks.syncOk, false);
    assert.deepEqual(report.summary?.syncAdvice.lowConfidenceModules, ["diplomacyPublic"]);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot preflight blocks mismatched bridge manifests", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-preflight-bad-manifest-"));
  try {
    await writeFixtureBridgeOutput(outputDir, "fixture-export-0001");
    const manifestPath = path.join(outputDir, "latest-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.checksumSha256 = "0".repeat(64);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const report = await runCopilotPreflight({
      snapshotDir: outputDir,
      intents: ["war"]
    });

    assert.equal(report.canAnalyze, false);
    assert.equal(report.exitCode, 1);
    assert.equal(report.checks.manifestConsistent, false);
    assert.equal(report.issues.length > 0, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot preflight blocks incompatible Mod and skill major.minor versions", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-preflight-compat-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.source.compatVersion = "9.9";
    snapshot.source.modVersion = "9.9.0";
    await writeLatestWithManifest(outputDir, snapshot);

    const report = await runCopilotPreflight({
      snapshotDir: outputDir,
      intents: ["war"]
    });

    assert.equal(report.canAnalyze, false);
    assert.equal(report.checks.compatibilityOk, false);
    assert.equal(report.issues.length > 0, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot preflight allows compatible patch differences with a warning", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-preflight-patch-"));
  try {
    const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
    snapshot.source.compatVersion = COMPAT_VERSION;
    snapshot.source.modVersion = VERSION.replace(/\.\d+(?:[-+].*)?$/, ".999");
    await writeLatestWithManifest(outputDir, snapshot);

    const report = await runCopilotPreflight({
      snapshotDir: outputDir,
      intents: ["war"]
    });

    assert.equal(report.canAnalyze, true, JSON.stringify(report, null, 2));
    assert.equal(report.checks.compatibilityOk, true);
    assert.equal(report.warnings.length > 0, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot preflight points to the standard entry when no snapshot is configured", async () => {
  const report = await runCopilotPreflight({ intents: ["war"] });

  assert.equal(report.canAnalyze, false);
  assert.equal(report.exitCode, 1);
  assert.equal(report.checks.snapshotFound, false);
  assert.equal(report.nextActions.length > 0, true);
  assert.equal(report.nextActions.some((action) => action.includes("左上副官入口")), true);
  assert.equal(report.nextActions.some((action) => action.includes("简报已汇总")), true);
  assert.equal(report.nextActions.some((action) => action.includes("npm run copilot")), true);
  assert.equal(report.nextActions.some((action) => action.includes("--intent")), true);
});

async function writeFixtureBridgeOutput(outputDir: string, exportId: string): Promise<void> {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.exportedAt = new Date().toISOString();
  const logContent = buildSnapshotLogLines(snapshot, { exportId, chunkSize: 128 }).join("\n");
  const assembled = assembleLatestCompleteExport(parseLogContent(logContent));
  await writeSnapshotOutputs(assembled.snapshot, outputDir, {
    exportId: assembled.exportId,
    checksumSha256: assembled.checksumSha256
  });
}

async function writeLatestWithManifest(
  outputDir: string,
  snapshot: Record<string, unknown>,
  options: { refreshExportedAt?: boolean } = {}
): Promise<void> {
  if (options.refreshExportedAt !== false) {
    snapshot.exportedAt = new Date().toISOString();
  }
  const latestPath = path.join(outputDir, "latest.json");
  const manifestPath = path.join(outputDir, "latest-manifest.json");
  const jsonText = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(latestPath, jsonText, "utf8");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        exportId: "fixture-export-0001",
        checksumSha256: createHash("sha256").update(Buffer.from(jsonText, "utf8")).digest("hex"),
        latestPath,
        snapshotPath: latestPath,
        writtenAt: new Date(0).toISOString()
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
