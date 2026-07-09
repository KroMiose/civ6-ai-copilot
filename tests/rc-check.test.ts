import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runRcCheck,
  validateManualTestTemplates
} from "../tools/release/src/rc-check.js";
import { createPassingManualEvidence } from "./manual-evidence-fixture.js";

test("release candidate check passes offline gates and keeps manual gates explicit", async () => {
  const report = await runRcCheck({ rootDir: path.resolve(".") });

  assert.equal(report.automaticOk, true, JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
  assert.equal(report.gates.some((gate) => gate.id === "mod-source" && gate.status === "pass"), true);
  assert.equal(report.gates.some((gate) => gate.id === "skill-source" && gate.status === "pass"), true);
  assert.equal(report.gates.some((gate) => gate.id === "skill-package" && gate.status === "pass"), true);
  assert.equal(report.gates.some((gate) => gate.id === "release-bundle" && gate.status === "pass"), true);
  assert.equal(report.gates.some((gate) => gate.id === "fake-log-bridge" && gate.status === "pass"), true);
  const fakeLogGate = report.gates.find((gate) => gate.id === "fake-log-bridge");
  const fakeLogDetails = fakeLogGate?.details as {
    macCodexMachineChecks?: {
      skillInstalledValidated?: boolean;
      handoffGenerated?: boolean;
      snapshotValidatedOnCopilotMachine?: boolean;
      preflightPassed?: boolean;
      summarizePassed?: boolean;
      localVisibilityNoticeShown?: boolean;
    };
  };
  assert.equal(fakeLogDetails.macCodexMachineChecks?.skillInstalledValidated, true);
  assert.equal(fakeLogDetails.macCodexMachineChecks?.handoffGenerated, true);
  assert.equal(fakeLogDetails.macCodexMachineChecks?.snapshotValidatedOnCopilotMachine, true);
  assert.equal(fakeLogDetails.macCodexMachineChecks?.preflightPassed, true);
  assert.equal(fakeLogDetails.macCodexMachineChecks?.summarizePassed, true);
  assert.equal(fakeLogDetails.macCodexMachineChecks?.localVisibilityNoticeShown, true);
  assert.equal(report.gates.some((gate) => gate.id === "privacy-check" && gate.status === "pass"), true);
  assert.equal(report.gates.some((gate) => gate.id === "manual-test-templates" && gate.status === "pass"), true);
  assert.equal(report.manualRequired.includes("manual-windows-civ6-load"), true);
  assert.equal(report.manualRequired.includes("manual-multiplayer-fairness"), true);
  assert.equal(report.manualRequired.includes("manual-mac-codex-copilot"), true);
  assert.equal(report.gates.some((gate) => gate.status === "fail"), false);

});

test("manual template validation checks required files and evidence template structure", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-manual-template-"));
  try {
    await mkdir(path.join(tempDir, "tests", "manual"), { recursive: true });
    await writeFile(
      path.join(tempDir, "tests", "manual", "windows-civ6-smoke-test.md"),
      "",
      "utf8"
    );
    await writeFile(
      path.join(tempDir, "tests", "manual", "multiplayer-fairness-test.md"),
      "",
      "utf8"
    );
    await writeFile(
      path.join(tempDir, "tests", "manual", "mac-codex-handoff-test.md"),
      "",
      "utf8"
    );
    await writeFile(
      path.join(tempDir, "tests", "manual", "manual-evidence-template.json"),
      JSON.stringify({ evidenceKind: "template" }, null, 2),
      "utf8"
    );

    const validation = await validateManualTestTemplates(tempDir);

    assert.equal(validation.ok, false);
    assert.equal(validation.issues.length > 0, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release candidate check can consume structured manual evidence", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-manual-evidence-"));
  try {
    const evidencePath = path.join(tempDir, "manual-evidence.json");
    await writeFile(evidencePath, JSON.stringify(createPassingManualEvidence(), null, 2), "utf8");

    const report = await runRcCheck({
      rootDir: path.resolve("."),
      manualEvidencePath: evidencePath
    });

    assert.equal(report.automaticOk, true, JSON.stringify(report, null, 2));
    assert.equal(report.ok, true);
    assert.deepEqual(report.manualRequired, []);
    assert.equal(report.gates.some((gate) => gate.id === "manual-evidence-file" && gate.status === "pass"), true);
    assert.equal(report.gates.some((gate) => gate.id === "manual-windows-civ6-load" && gate.status === "pass"), true);
    assert.equal(report.gates.some((gate) => gate.id === "manual-multiplayer-fairness" && gate.status === "pass"), true);
    assert.equal(report.gates.some((gate) => gate.id === "manual-mac-codex-copilot" && gate.status === "pass"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
