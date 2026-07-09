import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCopilotHandoff } from "../../copilot/src/handoff.js";
import { summarizeSnapshotFile } from "../../copilot/src/summarize-snapshot.js";
import { runCopilotPreflight } from "../../copilot/src/preflight.js";
import { runBridgeOnce } from "../../bridge/src/bridge.js";
import { buildSnapshotLogLinesWithCompletionDiagnostic } from "../../bridge/src/parser.js";
import { COPILOT_DIAGNOSTIC, COPILOT_LOADED } from "../../bridge/src/protocol.js";
import { runDoctor } from "../../doctor/src/doctor.js";
import { createPackageDirectory, validateModSource } from "../../package/src/mod-package.js";
import { runPrivacyCheck } from "../../privacy/src/privacy-check.js";
import { renderSnapshotMapToFile } from "../../render-map/src/render-map.js";
import { createSkillPackageDirectory, installSkill, validateSkillSource } from "../../skill-package/src/skill-package.js";
import { validateSnapshotFile } from "../../snapshot/src/validate.js";
import { createManualEvidenceDraft } from "./manual-evidence-draft.js";
import { validateManualEvidenceFile } from "./manual-evidence.js";
import { createReleaseBundle } from "./release-bundle.js";
import { PROTOCOL_VERSION, VERSION } from "../../project/src/version.js";

export type RcGateStatus = "pass" | "fail" | "manual-required";

export interface RcGate {
  id: string;
  title: string;
  status: RcGateStatus;
  message: string;
  details?: unknown;
}

export interface RcCheckOptions {
  rootDir: string;
  keepTemp?: boolean;
  manualEvidencePath?: string;
}

export interface RcCheckReport {
  ok: boolean;
  automaticOk: boolean;
  generatedAt: string;
  gates: RcGate[];
  manualRequired: string[];
  tempDir?: string;
}

export interface ManualTestTemplateValidation {
  ok: boolean;
  issues: string[];
  templates: string[];
}

interface ManualTemplateSpec {
  path: string;
}

const manualTemplateSpecs: ManualTemplateSpec[] = [
  { path: "tests/manual/windows-civ6-smoke-test.md" },
  { path: "tests/manual/multiplayer-fairness-test.md" },
  { path: "tests/manual/mac-codex-handoff-test.md" },
  { path: "tests/manual/manual-evidence-template.json" }
];

export async function runRcCheck(options: RcCheckOptions): Promise<RcCheckReport> {
  const rootDir = path.resolve(options.rootDir);
  const gates: RcGate[] = [];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-rc-"));

  try {
    const modSourceDir = path.join(rootDir, "mod");
    const skillSourceDir = path.join(rootDir, "skill");
    const fixturePath = path.join(rootDir, "tests/fixtures/minimal-player-visible.snapshot.json");
    const snapshotDir = path.join(tempDir, "snapshots");
    const luaLogPath = path.join(tempDir, "Lua.log");

    gates.push(await checkModSource(modSourceDir));
    gates.push(await checkModPackage(modSourceDir, path.join(tempDir, "release")));
    gates.push(await checkSkillSource(skillSourceDir));
    gates.push(await checkSkillPackage(skillSourceDir, path.join(tempDir, "release")));
    gates.push(await checkReleaseBundle(rootDir, path.join(tempDir, "bundle")));
    gates.push(await checkFixture(fixturePath));
    gates.push(await checkBridgeDoctorPreflightAndSummary({ rootDir, modSourceDir, fixturePath, luaLogPath, snapshotDir }));
    gates.push(await checkPrivacy(rootDir));
    gates.push(await checkManualTemplates(rootDir));
    gates.push(...(await checkManualGates(rootDir, options.manualEvidencePath)));

    const automaticOk = !gates.some((gate) => gate.status === "fail");
    const manualRequired = gates.filter((gate) => gate.status === "manual-required").map((gate) => gate.id);
    return {
      ok: automaticOk,
      automaticOk,
      generatedAt: new Date().toISOString(),
      gates,
      manualRequired,
      tempDir: options.keepTemp ? tempDir : undefined
    };
  } finally {
    if (!options.keepTemp) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

export function formatRcCheckMarkdown(report: RcCheckReport): string {
  const lines = [
    "# civ6-ai-copilot RC Check",
    "",
    `- 自动检查：${report.automaticOk ? "通过" : "失败"}`,
    `- 手工验证项：${report.manualRequired.length}`,
    `- 生成时间：${report.generatedAt}`,
    "",
    "## Gates",
    ...report.gates.map((gate) => `- ${gate.status}: ${gate.id} - ${gate.message}`)
  ];

  if (report.tempDir) {
    lines.push("", `临时目录：${report.tempDir}`);
  }

  return `${lines.join("\n")}\n`;
}

async function checkModSource(modSourceDir: string): Promise<RcGate> {
  const validation = await validateModSource(modSourceDir);
  return validation.ok
    ? {
        id: "mod-source",
        title: "Mod source validation",
        status: "pass",
        message: "Mod 源目录结构、.modinfo、UI、Lua 和文本文件校验通过。",
        details: validation
      }
    : {
        id: "mod-source",
        title: "Mod source validation",
        status: "fail",
        message: "Mod 源目录校验失败。",
        details: validation
      };
}

async function checkModPackage(modSourceDir: string, outputDir: string): Promise<RcGate> {
  const result = await createPackageDirectory({ sourceDir: modSourceDir, outputDir, clean: true });
  if (!result.validation.ok) {
    return {
      id: "mod-package",
      title: "Mod release package",
      status: "fail",
      message: "Mod 发布目录生成失败或结构不可安装。",
      details: result.validation
    };
  }

  return {
    id: "mod-package",
    title: "Mod release package",
    status: "pass",
    message: "可安装的 civ6-ai-copilot 发布目录已生成，文件哈希清单已校验通过。",
    details: {
      files: result.validation.files
    }
  };
}

async function checkSkillSource(skillSourceDir: string): Promise<RcGate> {
  const validation = await validateSkillSource(skillSourceDir);
  return validation.ok
    ? {
        id: "skill-source",
        title: "Skill source validation",
        status: "pass",
        message: "Skill 源目录、metadata、Mod 同步引导、doctor/exported 诊断和模块映射校验通过。",
        details: validation
      }
    : {
        id: "skill-source",
        title: "Skill source validation",
        status: "fail",
        message: "Skill 源目录校验失败。",
        details: validation
      };
}

async function checkSkillPackage(skillSourceDir: string, outputDir: string): Promise<RcGate> {
  const result = await createSkillPackageDirectory({ sourceDir: skillSourceDir, outputDir, clean: true });
  if (!result.validation.ok) {
    return {
      id: "skill-package",
      title: "Skill release package",
      status: "fail",
      message: "Skill 发布目录生成失败或结构不可安装。",
      details: result.validation
    };
  }

  return {
    id: "skill-package",
    title: "Skill release package",
    status: "pass",
    message: "可安装的 civ6-ai-copilot skill 发布目录已生成，文件哈希清单已校验通过。",
    details: {
      files: result.validation.files
    }
  };
}

async function checkReleaseBundle(rootDir: string, outputDir: string): Promise<RcGate> {
  const result = await createReleaseBundle({ rootDir, outputDir, clean: true });
  if (!result.validation.ok) {
    return {
      id: "release-bundle",
      title: "Combined release bundle",
      status: "fail",
      message: "统一 release bundle 生成失败或文件哈希校验失败。",
      details: result.validation
    };
  }

  return {
    id: "release-bundle",
    title: "Combined release bundle",
    status: "pass",
    message: "统一 release bundle 已生成，包含 Mod 包、skill 包、可运行 tooling、Windows/Mac 根脚本、手工测试模板、文档和总哈希清单。",
    details: {
      files: result.validation.files
    }
  };
}

async function checkFixture(fixturePath: string): Promise<RcGate> {
  const validation = await validateSnapshotFile(fixturePath);
  return validation.ok
    ? {
        id: "fixture-snapshot",
        title: "Example fixture snapshot",
        status: "pass",
        message: "示例 fixture 通过 schema 和多人公平校验。",
        details: validation
      }
    : {
        id: "fixture-snapshot",
        title: "Example fixture snapshot",
        status: "fail",
        message: "示例 fixture 未通过 schema 或多人公平校验。",
        details: validation
      };
}

async function checkBridgeDoctorPreflightAndSummary(options: {
  rootDir: string;
  modSourceDir: string;
  fixturePath: string;
  luaLogPath: string;
  snapshotDir: string;
}): Promise<RcGate> {
  const snapshot = JSON.parse(await readFile(options.fixturePath, "utf8"));
  snapshot.exportedAt = new Date().toISOString();
  const fakeLogLines = [
    "[Civ6] unrelated log line before export",
    `${COPILOT_LOADED} version=${VERSION}`,
    `${COPILOT_DIAGNOSTIC} ${JSON.stringify({
      modVersion: VERSION,
      protocolVersion: PROTOCOL_VERSION,
      reason: "loaded",
      hasBitlib: true,
      base64SelfTest: true,
      sha256SelfTest: true,
      hasControls: true,
      hasGame: true,
      hasPlayers: true,
      hasMap: true,
      hasUnitsInPlot: true,
      hasPlayerResources: true,
      hasGameInfoResources: true,
      hasPlayerTechs: true,
      hasGameInfoTechnologies: true,
      hasPlayerCulture: true,
      hasGameInfoCivics: true,
      hasGameInfoGovernments: true,
      hasGameInfoPolicies: true,
      hasGameInfoGovernmentSlots: true,
      emittedAt: new Date(0).toISOString()
    })}`,
    ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
      exportId: "rc-check-export",
      chunkSize: 256
    }),
    "[Civ6] unrelated log line after export"
  ];
  await writeFile(options.luaLogPath, `${fakeLogLines.join("\n")}\n`, "utf8");

  const bridge = await runBridgeOnce({
    inputLog: options.luaLogPath,
    outputDir: options.snapshotDir
  });
  if (!bridge.ok || !("written" in bridge) || !bridge.written) {
    return {
      id: "fake-log-bridge",
      title: "Fake Lua.log bridge loop",
      status: "fail",
      message: "fake Lua.log 无法通过 bridge 重组为 latest.json。",
      details: bridge
    };
  }

  const doctor = await runDoctor({
    modSourceDir: options.modSourceDir,
    inputLog: options.luaLogPath,
    snapshotDir: options.snapshotDir
  });
  if (!doctor.ok) {
    return {
      id: "fake-log-bridge",
      title: "Fake Lua.log bridge loop",
      status: "fail",
      message: "fake Lua.log 已生成 snapshot，但 doctor 诊断失败。",
      details: doctor
    };
  }

  const preflight = await runCopilotPreflight({
    snapshotPath: bridge.written.latestPath,
    question: "我现在该不该开战？"
  });
  if (!preflight.canAnalyze) {
    return {
      id: "fake-log-bridge",
      title: "Fake Lua.log bridge loop",
      status: "fail",
      message: "fake Lua.log 已生成 snapshot，但 preflight 认为当前快照不能用于回答。",
      details: preflight
    };
  }

  const summary = await summarizeSnapshotFile(bridge.written.latestPath, {
    question: "我现在该不该开战？"
  });
  if (!summary.validation.ok || !summary.syncAdvice.ok) {
    return {
      id: "fake-log-bridge",
      title: "Fake Lua.log bridge loop",
      status: "fail",
      message: "snapshot 可重组但副官摘要或同步建议未通过。",
      details: summary
    };
  }

  const renderedMap = await renderSnapshotMapToFile(bridge.written.latestPath, `${options.snapshotDir}/visible-map.svg`);
  if (!renderedMap.validation.ok || renderedMap.counts.tiles === 0) {
    return {
      id: "fake-log-bridge",
      title: "Fake Lua.log bridge loop",
      status: "fail",
      message: "snapshot 可重组但可见地图 SVG 渲染失败。",
      details: renderedMap
    };
  }

  const handoff = await runCopilotHandoff({
    snapshotDir: options.snapshotDir,
    outputDir: path.join(options.snapshotDir, "handoff"),
    question: "我现在该不该开战？",
    clean: true
  });
  if (!handoff.readyForCopilot || !handoff.codexPromptPath || !handoff.summaryMarkdownPath || !handoff.copiedSnapshotPath) {
    return {
      id: "fake-log-bridge",
      title: "Fake Lua.log bridge loop",
      status: "fail",
      message: "snapshot 可重组但 Windows->Mac handoff 交接包未就绪，缺少 Codex prompt、摘要或 snapshot 副本。",
      details: handoff
    };
  }

  const originalCodexHome = process.env.CODEX_HOME;
  const rcCodexHome = path.join(options.snapshotDir, "codex-home");
  let evidenceDraft;
  try {
    process.env.CODEX_HOME = rcCodexHome;
    const installedInTempCodexHome = await installSkill({
      sourceDir: path.join(options.rootDir, "skill"),
      clean: true
    });
    if (!installedInTempCodexHome.validation.ok) {
      return {
        id: "fake-log-bridge",
        title: "Fake Lua.log bridge loop",
        status: "fail",
        message: "snapshot 可重组且 handoff 已生成，但临时 Mac Codex skill 安装校验失败。",
        details: installedInTempCodexHome.validation
      };
    }
    evidenceDraft = await createManualEvidenceDraft({
      rootDir: options.rootDir,
      inputLog: options.luaLogPath,
      snapshotDir: options.snapshotDir,
      handoffDir: handoff.outputDir,
      playerASnapshot: bridge.written.latestPath,
      playerBSnapshot: bridge.written.latestPath,
      outputPath: path.join(options.snapshotDir, "manual-evidence-draft.json"),
      question: "我现在该不该开战？"
    });
  } finally {
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
  }
  const macCodexChecks = evidenceDraft.machineChecks.macCodexCopilot;
  if (
    !evidenceDraft.draftValidation.schemaOk ||
    !evidenceDraft.draftValidation.artifactScopeOk ||
    evidenceDraft.draftValidation.realEvidence ||
    !macCodexChecks ||
    macCodexChecks.issues.length > 0 ||
    !macCodexChecks.skillInstalledValidated ||
    !macCodexChecks.handoffGenerated ||
    !macCodexChecks.snapshotValidatedOnCopilotMachine ||
    !macCodexChecks.preflightPassed ||
    !macCodexChecks.summarizePassed ||
    !macCodexChecks.localVisibilityNoticeShown
  ) {
    return {
      id: "fake-log-bridge",
      title: "Fake Lua.log bridge loop",
      status: "fail",
      message: "snapshot 可重组但手工证据草稿或 Mac Codex handoff 机器预检失败。",
      details: evidenceDraft
    };
  }

  return {
    id: "fake-log-bridge",
    title: "Fake Lua.log bridge loop",
    status: "pass",
    message: "fake Lua.log -> bridge -> doctor -> preflight -> summarize -> render-map -> handoff -> skill-install -> evidence-draft 最小闭环通过。",
    details: {
      exportId: bridge.exportId,
      summaryCounts: summary.coverage.counts,
      preflight: preflight.checks,
      renderedMap: renderedMap.counts,
      handoffFiles: handoff.includedFiles.map((file) => path.basename(file)),
      macCodexMachineChecks: {
        skillInstalledValidated: macCodexChecks.skillInstalledValidated,
        handoffGenerated: macCodexChecks.handoffGenerated,
        snapshotValidatedOnCopilotMachine: macCodexChecks.snapshotValidatedOnCopilotMachine,
        preflightPassed: macCodexChecks.preflightPassed,
        summarizePassed: macCodexChecks.summarizePassed,
        localVisibilityNoticeShown: macCodexChecks.localVisibilityNoticeShown
      },
      evidenceDraftSchemaOk: evidenceDraft.draftValidation.schemaOk,
      evidenceDraftArtifactScopeOk: evidenceDraft.draftValidation.artifactScopeOk
    }
  };
}

async function checkPrivacy(rootDir: string): Promise<RcGate> {
  const privacy = await runPrivacyCheck({ rootDir });
  return privacy.ok
    ? {
        id: "privacy-check",
        title: "Repository artifact check",
        status: "pass",
        message: "仓库发布扫描通过，release-blocking artifact issues 为 0。",
        details: privacy
      }
    : {
        id: "privacy-check",
        title: "Repository artifact check",
        status: "fail",
        message: "仓库发布扫描失败，请查看 artifact issues。",
        details: privacy
      };
}

async function checkManualTemplates(rootDir: string): Promise<RcGate> {
  const validation = await validateManualTestTemplates(rootDir);

  return validation.ok
    ? {
        id: "manual-test-templates",
        title: "Manual test templates",
        status: "pass",
        message: "Windows 冒烟测试、多人公平测试、Mac Codex handoff 副官测试和证据模板内容校验通过。",
        details: validation
      }
    : {
        id: "manual-test-templates",
        title: "Manual test templates",
        status: "fail",
        message: "手工测试模板缺失或缺少关键验收步骤。",
        details: validation
      };
}

export async function validateManualTestTemplates(rootDir: string): Promise<ManualTestTemplateValidation> {
  const issues: string[] = [];
  const templates = manualTemplateSpecs.map((spec) => spec.path);

  for (const spec of manualTemplateSpecs) {
    const relativePath = spec.path;
    const absolutePath = path.join(rootDir, relativePath);
    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        issues.push(`${relativePath} exists but is not a file`);
        continue;
      }
    } catch {
      issues.push(`missing manual test template: ${relativePath}`);
      continue;
    }

    if (relativePath.endsWith("manual-evidence-template.json")) {
      const evidenceTemplate = await validateManualEvidenceFile(absolutePath);
      if (!evidenceTemplate.schemaOk) {
        issues.push(`${relativePath} must pass manual evidence schema validation as a template`);
      }
      if (!evidenceTemplate.artifactScopeOk) {
        issues.push(`${relativePath} must keep release evidence limited to structured gate results and required metadata`);
      }
      if (evidenceTemplate.realEvidence) {
        issues.push(`${relativePath} must keep evidenceKind=template`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    templates
  };
}

async function checkManualGates(rootDir: string, manualEvidencePath?: string): Promise<RcGate[]> {
  if (!manualEvidencePath) {
    return [
      {
        id: "manual-windows-civ6-load",
        title: "Windows Civ6 Additional Content load",
        status: "manual-required",
        message:
          "需要在真实 Windows Civ6 中启用 Mod，进入游戏确认 Copilot 面板、本地化文本和 Lua.log 导出。使用 tests/manual/windows-civ6-smoke-test.md 记录，可先用 npm run evidence:draft 生成测试证据草稿，再用 npm run evidence:finalize 和 evidence:validate 校验最终 JSON 证据。"
      },
      {
        id: "manual-multiplayer-fairness",
        title: "Two-player multiplayer fairness test",
        status: "manual-required",
        message:
          "需要两名真人玩家在同一多人局分别导出 snapshot，确认只包含各自理论可见信息。使用 tests/manual/multiplayer-fairness-test.md 记录，并在 evidence:draft/evidence:finalize/evidence:validate 通过最终证据后用 --manual-evidence 接入结果。"
      },
      {
        id: "manual-mac-codex-copilot",
        title: "Mac Codex handoff copilot test",
        status: "manual-required",
        message:
          "需要在 Mac Codex 副官机安装并验证 Mod-first civ6-ai-copilot skill，读取 handoff/codex-prompt.md 和 copilot-handoff.md，确认缺同步时只要求回 Copilot 面板补数据而不盲答。最终证据通过 evidence:finalize/evidence:validate 后用 --manual-evidence 接入结果。"
      }
    ];
  }

  const resolvedEvidencePath = path.isAbsolute(manualEvidencePath)
    ? manualEvidencePath
    : path.resolve(rootDir, manualEvidencePath);
  const validation = await validateManualEvidenceFile(resolvedEvidencePath);

  return [
    {
      id: "manual-evidence-file",
      title: "Structured manual evidence file",
      status: validation.evidenceFileOk ? "pass" : "fail",
      message: validation.evidenceFileOk
        ? "手工证据 JSON 结构、真实测试标记和发布材料边界校验通过。"
        : "手工证据 JSON 不足以作为真实 RC 证据；请补齐结构化 gate 结论、版本和必要测试 metadata。",
      details: {
        path: resolvedEvidencePath,
        validation
      }
    },
    {
      id: "manual-windows-civ6-load",
      title: "Windows Civ6 Additional Content load",
      status: validation.gates.windowsCiv6Load ? "pass" : "fail",
      message: validation.gates.windowsCiv6Load
        ? "真实 Windows Civ6 加载、面板、导出、bridge、validate、summarize、render-map 和隐私检查证据通过。"
        : "真实 Windows Civ6 加载证据未通过；请按 tests/manual/windows-civ6-smoke-test.md 补齐后重新运行 --manual-evidence。",
      details: validation
    },
    {
      id: "manual-multiplayer-fairness",
      title: "Two-player multiplayer fairness test",
      status: validation.gates.multiplayerFairness ? "pass" : "fail",
      message: validation.gates.multiplayerFairness
        ? "双人多人公平证据通过，双方 snapshot 均保持本地玩家理论可见边界。"
        : "双人多人公平证据未通过；请按 tests/manual/multiplayer-fairness-test.md 补齐后重新运行 --manual-evidence。",
      details: validation
    },
    {
      id: "manual-mac-codex-copilot",
      title: "Mac Codex handoff copilot test",
      status: validation.gates.macCodexCopilot ? "pass" : "fail",
      message: validation.gates.macCodexCopilot
        ? "Mac Codex 副官证据通过，已验证 skill 安装、handoff prompt 读取顺序、本地可见性提醒和缺同步阻断行为。"
        : "Mac Codex 副官证据未通过；请安装/校验 skill，读取 handoff prompt，并确认缺同步时不会盲答后重新运行 --manual-evidence。",
      details: validation
    }
  ];
}
