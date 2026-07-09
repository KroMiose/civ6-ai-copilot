import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runOfflineSmoke } from "../tools/smoke/src/offline-smoke.js";

test("offline smoke runs the full fake Lua.log copilot loop", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-offline-smoke-test-"));
  try {
    const report = await runOfflineSmoke({
      rootDir: path.resolve("."),
      outputDir,
      clean: true,
      intents: ["war"]
    });

    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(report.steps.map((step) => step.id).join(","), "fake-lua-log,bridge,doctor,preflight,summary,render-map,handoff");
    assert.equal(report.steps.every((step) => step.status === "pass"), true);
    assert.ok(report.latestPath);
    assert.ok(report.manifestPath);
    assert.ok(report.summaryPath);
    assert.ok(report.mapPath);
    assert.ok(report.codexPromptPath);
    assert.ok(report.handoffMarkdownPath);
    assert.ok(report.reportPath);

    await stat(report.luaLogPath);
    await stat(report.latestPath);
    await stat(report.manifestPath);
    await stat(report.summaryPath);
    await stat(report.mapPath);
    await stat(report.codexPromptPath);
    await stat(report.handoffMarkdownPath);
    await stat(report.reportPath);

    const latest = JSON.parse(await readFile(report.latestPath, "utf8"));
    const savedReport = JSON.parse(await readFile(report.reportPath, "utf8"));

    assert.equal(latest.source.exportId, "offline-smoke-export");
    assert.equal(savedReport.ok, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
