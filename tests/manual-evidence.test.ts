import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runManualEvidenceCheck,
  validateManualEvidenceObject
} from "../tools/release/src/manual-evidence.js";
import { createPassingManualEvidence } from "./manual-evidence-fixture.js";

test("manual evidence accepts structured real pass results", async () => {
  const result = await validateManualEvidenceObject(createPassingManualEvidence());

  assert.equal(result.schemaOk, true, JSON.stringify(result, null, 2));
  assert.equal(result.artifactScopeOk, true, JSON.stringify(result, null, 2));
  assert.equal(result.realEvidence, true);
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.deepEqual(result.gates, {
    windowsCiv6Load: true,
    multiplayerFairness: true,
    macCodexCopilot: true
  });
});

test("manual evidence templates cannot satisfy release gates", async () => {
  const evidence = createPassingManualEvidence();
  evidence.evidenceKind = "template";

  const result = await validateManualEvidenceObject(evidence);

  assert.equal(result.schemaOk, true, JSON.stringify(result, null, 2));
  assert.equal(result.realEvidence, false);
  assert.equal(result.ok, false);
  assert.equal(result.policyIssues.length > 0, true);
  assert.deepEqual(result.gates, {
    windowsCiv6Load: false,
    multiplayerFairness: false,
    macCodexCopilot: false
  });
});

test("manual evidence rejects private paths and save names in free text", async () => {
  const evidence = createPassingManualEvidence();
  evidence.notes = "bad evidence note: C:\\Users\\Alice\\Documents\\private-game.Civ6Save";

  const result = await validateManualEvidenceObject(evidence);

  assert.equal(result.schemaOk, true, JSON.stringify(result, null, 2));
  assert.equal(result.artifactScopeOk, false);
  assert.equal(result.ok, false);
  assert.equal(result.artifactScopeIssues.length > 0, true);
});

test("manual evidence warns but does not fail when player resource API is unavailable", async () => {
  const evidence = createPassingManualEvidence();
  (evidence.windowsSmoke as Record<string, unknown>).hasPlayerResources = false;

  const result = await validateManualEvidenceObject(evidence);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.warnings.some((warning) => warning.includes("hasPlayerResources")), true);
});

test("manual evidence warns but does not fail when progression or policy APIs are unavailable", async () => {
  const evidence = createPassingManualEvidence();
  (evidence.windowsSmoke as Record<string, unknown>).hasPlayerProgression = false;
  (evidence.windowsSmoke as Record<string, unknown>).hasGovernmentPolicies = false;

  const result = await validateManualEvidenceObject(evidence);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.warnings.some((warning) => warning.includes("hasPlayerProgression")), true);
  assert.equal(result.warnings.some((warning) => warning.includes("hasGovernmentPolicies")), true);
});

test("manual evidence check report explains a passing evidence file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-manual-evidence-check-"));
  try {
    const evidencePath = path.join(tempDir, "manual-evidence.json");
    await writeFile(evidencePath, JSON.stringify(createPassingManualEvidence(), null, 2), "utf8");

    const report = await runManualEvidenceCheck({ evidencePath });

    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    assert.equal(report.evidencePath, evidencePath);
    assert.equal(report.validation.gates.windowsCiv6Load, true);
    assert.equal(report.validation.gates.multiplayerFairness, true);
    assert.equal(report.validation.gates.macCodexCopilot, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("manual evidence check report explains why templates fail", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-manual-evidence-template-"));
  try {
    const evidence = createPassingManualEvidence();
    evidence.evidenceKind = "template";
    const evidencePath = path.join(tempDir, "manual-evidence-template.json");
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf8");

    const report = await runManualEvidenceCheck({ evidencePath });

    assert.equal(report.ok, false);
    assert.equal(report.validation.realEvidence, false);
    assert.equal(report.validation.policyIssues.length > 0, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
