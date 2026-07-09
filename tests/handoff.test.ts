import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCopilotHandoff } from "../tools/copilot/src/handoff.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("copilot handoff creates a Mac Codex-ready folder from a bridge snapshot", async () => {
  const sourceDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-handoff-source-"));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-handoff-output-"));
  try {
    await writeFixtureLatestWithManifest(sourceDir, "handoff-export-0001");

    const report = await runCopilotHandoff({
      snapshotDir: sourceDir,
      outputDir,
      clean: true,
      intents: ["war"]
    });

    assert.equal(report.readyForCopilot, true, JSON.stringify(report, null, 2));
    assert.equal(report.exitCode, 0);
    assert.ok(report.copiedSnapshotPath);
    assert.ok(report.copiedManifestPath);
    assert.ok(report.summaryMarkdownPath);
    assert.ok(report.mapPath);

    await stat(path.join(outputDir, "copilot-handoff.md"));
    await stat(path.join(outputDir, "copilot-handoff.json"));
    await stat(path.join(outputDir, "codex-prompt.md"));
    await stat(path.join(outputDir, "copilot-summary.md"));
    await stat(path.join(outputDir, "latest.json"));
    await stat(path.join(outputDir, "latest-manifest.json"));
    await stat(path.join(outputDir, "visible-map.svg"));

    const handoffJson = JSON.parse(await readFile(path.join(outputDir, "copilot-handoff.json"), "utf8"));
    const copiedSnapshot = JSON.parse(await readFile(path.join(outputDir, "latest.json"), "utf8"));

    assert.equal(handoffJson.readyForCopilot, true);
    assert.equal(typeof handoffJson.codexPromptPath, "string");
    assert.equal(handoffJson.includedFiles.length >= 6, true);
    assert.equal(copiedSnapshot.source.exportId, "handoff-export-0001");
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("copilot handoff asks for Copilot panel sync when intent modules are missing", async () => {
  const sourceDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-handoff-missing-source-"));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-handoff-missing-output-"));
  try {
    await writeFixtureLatestWithManifest(sourceDir, "handoff-export-0002", (snapshot) => {
      snapshot.modules = ["meta", "localPlayer", "cities"];
    });

    const report = await runCopilotHandoff({
      snapshotDir: sourceDir,
      outputDir,
      clean: true,
      intents: ["policy"]
    });

    assert.equal(report.readyForCopilot, false);
    assert.equal(report.exitCode, 2);
    assert.equal(report.preflight.checks.syncOk, false);

    const handoffJson = JSON.parse(await readFile(path.join(outputDir, "copilot-handoff.json"), "utf8"));
    assert.equal(handoffJson.readyForCopilot, false);
    assert.deepEqual(handoffJson.summary.syncAdvice.missingModules.sort(), ["government", "policies", "resources"].sort());
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});

async function writeFixtureLatestWithManifest(
  outputDir: string,
  exportId: string,
  mutate?: (snapshot: Record<string, any>) => void
): Promise<void> {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.source = {
    ...snapshot.source,
    exportId
  };
  snapshot.exportedAt = new Date().toISOString();
  mutate?.(snapshot);

  const latestPath = path.join(outputDir, "latest.json");
  const manifestPath = path.join(outputDir, "latest-manifest.json");
  const jsonText = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(latestPath, jsonText, "utf8");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        exportId,
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
