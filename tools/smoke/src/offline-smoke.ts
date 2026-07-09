import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCopilotHandoff } from "../../copilot/src/handoff.js";
import { formatSnapshotSummaryMarkdown, summarizeSnapshotFile } from "../../copilot/src/summarize-snapshot.js";
import { runCopilotPreflight } from "../../copilot/src/preflight.js";
import { runBridgeOnce } from "../../bridge/src/bridge.js";
import { buildSnapshotLogLinesWithCompletionDiagnostic } from "../../bridge/src/parser.js";
import { COPILOT_DIAGNOSTIC, COPILOT_LOADED } from "../../bridge/src/protocol.js";
import { runDoctor } from "../../doctor/src/doctor.js";
import { renderSnapshotMapToFile } from "../../render-map/src/render-map.js";
import { PROTOCOL_VERSION, VERSION } from "../../project/src/version.js";

export type SmokeStepStatus = "pass" | "fail";

export interface SmokeStep {
  id: string;
  status: SmokeStepStatus;
  message: string;
  details?: unknown;
}

export interface OfflineSmokeOptions {
  rootDir: string;
  snapshotPath?: string;
  outputDir?: string;
  question?: string;
  intents?: string[];
  requiredModules?: string[];
  exportId?: string;
  chunkSize?: number;
  clean?: boolean;
}

export interface OfflineSmokeReport {
  ok: boolean;
  outputDir: string;
  luaLogPath: string;
  snapshotDir: string;
  latestPath?: string;
  manifestPath?: string;
  summaryPath?: string;
  mapPath?: string;
  handoffDir?: string;
  handoffMarkdownPath?: string;
  codexPromptPath?: string;
  reportPath?: string;
  question: string;
  intents: string[];
  requiredModules: string[];
  steps: SmokeStep[];
}

const defaultQuestion = "离线烟测";
const defaultIntents = ["war"];
const defaultExportId = "offline-smoke-export";

export async function runOfflineSmoke(options: OfflineSmokeOptions): Promise<OfflineSmokeReport> {
  const rootDir = path.resolve(options.rootDir);
  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-offline-smoke-"));
  const snapshotPath = path.resolve(options.snapshotPath ?? path.join(rootDir, "tests/fixtures/minimal-player-visible.snapshot.json"));
  const question = options.question ?? defaultQuestion;
  const intents = normalizedList(options.intents ?? defaultIntents);
  const requiredModules = normalizedList(options.requiredModules);
  const luaLogPath = path.join(outputDir, "fake-Lua.log");
  const snapshotDir = path.join(outputDir, "snapshots");
  const summaryPath = path.join(outputDir, "copilot-summary.md");
  const mapPath = path.join(outputDir, "visible-map.svg");
  const handoffDir = path.join(outputDir, "handoff");
  const steps: SmokeStep[] = [];

  if (options.clean && options.outputDir) {
    await rm(outputDir, { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });

  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    snapshot.exportedAt = new Date().toISOString();
    const lines = [
      "[Civ6] offline smoke fake Lua.log",
      `${COPILOT_LOADED} version=${VERSION}`,
      `${COPILOT_DIAGNOSTIC} ${JSON.stringify({
        modVersion: VERSION,
        protocolVersion: PROTOCOL_VERSION,
        reason: "offline-smoke",
        hasBitlib: true,
        base64SelfTest: true,
        sha256SelfTest: true,
        hasControls: true,
        hasGame: true,
        hasPlayers: true,
        hasMap: true,
        hasUnitsInPlot: true,
        emittedAt: new Date(0).toISOString()
      })}`,
      ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
        exportId: options.exportId ?? defaultExportId,
        chunkSize: options.chunkSize ?? 256
      })
    ];
    await writeFile(luaLogPath, `${lines.join("\n")}\n`, "utf8");
    steps.push({
      id: "fake-lua-log",
      status: "pass",
      message: "示例 fixture 已编码成 fake Lua.log chunk stream。",
      details: { luaLogPath, lineCount: lines.length }
    });
  } catch (error) {
    steps.push({
      id: "fake-lua-log",
      status: "fail",
      message: `无法生成 fake Lua.log：${(error as Error).message}`
    });
    return await finalizeReport({ outputDir, luaLogPath, snapshotDir, summaryPath, mapPath, question, intents, requiredModules, steps });
  }

  const bridge = await runBridgeOnce({
    inputLog: luaLogPath,
    outputDir: snapshotDir
  });
  if (!bridge.ok || !("written" in bridge) || !bridge.written) {
    steps.push({
      id: "bridge",
      status: "fail",
      message: "bridge 未能从 fake Lua.log 重组 latest.json。",
      details: bridge
    });
    return await finalizeReport({ outputDir, luaLogPath, snapshotDir, summaryPath, mapPath, question, intents, requiredModules, steps });
  }
  steps.push({
    id: "bridge",
    status: "pass",
    message: "bridge 已重组 latest.json 和 latest-manifest.json。",
    details: { exportId: bridge.exportId, written: bridge.written }
  });

  const doctor = await runDoctor({
    modSourceDir: path.join(rootDir, "mod"),
    inputLog: luaLogPath,
    snapshotDir
  });
  steps.push({
    id: "doctor",
    status: doctor.ok ? "pass" : "fail",
    message: doctor.ok ? "doctor 诊断通过，没有阻断项。" : "doctor 诊断发现阻断项。",
    details: doctor
  });
  if (!doctor.ok) {
    return await finalizeReport({
      outputDir,
      luaLogPath,
      snapshotDir,
      latestPath: bridge.written.latestPath,
      manifestPath: bridge.written.manifestPath,
      summaryPath,
      mapPath,
      question,
      intents,
      requiredModules,
      steps
    });
  }

  const preflight = await runCopilotPreflight({
    snapshotPath: bridge.written.latestPath,
    question,
    intents,
    requiredModules
  });
  steps.push({
    id: "preflight",
    status: preflight.canAnalyze ? "pass" : "fail",
    message: preflight.canAnalyze ? "preflight 确认可基于当前分析意图继续。" : "preflight 要求先更新情报或修复 snapshot。",
    details: preflight
  });
  if (!preflight.canAnalyze) {
    return await finalizeReport({
      outputDir,
      luaLogPath,
      snapshotDir,
      latestPath: bridge.written.latestPath,
      manifestPath: bridge.written.manifestPath,
      summaryPath,
      mapPath,
      question,
      intents,
      requiredModules,
      steps
    });
  }

  const summary = await summarizeSnapshotFile(bridge.written.latestPath, { question, intents, requiredModules });
  await writeFile(summaryPath, formatSnapshotSummaryMarkdown(summary), "utf8");
  steps.push({
    id: "summary",
    status: summary.validation.ok && summary.syncAdvice.ok ? "pass" : "fail",
    message: "副官预检摘要已生成。",
    details: { summaryPath, counts: summary.coverage.counts, syncAdvice: summary.syncAdvice }
  });

  const rendered = await renderSnapshotMapToFile(bridge.written.latestPath, mapPath);
  steps.push({
    id: "render-map",
    status: rendered.validation.ok && rendered.counts.tiles > 0 ? "pass" : "fail",
    message: "玩家可见 hex map SVG 已生成。",
    details: { mapPath, counts: rendered.counts }
  });

  const handoff = await runCopilotHandoff({
    snapshotDir,
    outputDir: handoffDir,
    question,
    intents,
    requiredModules,
    clean: true
  });
  steps.push({
    id: "handoff",
    status: handoff.readyForCopilot && Boolean(handoff.copiedSnapshotPath) ? "pass" : "fail",
    message: handoff.readyForCopilot
      ? "Windows->Mac Agent handoff 交接目录已生成。"
      : "handoff 已生成，但预检显示需要先更新情报或修复 snapshot。",
    details: {
      handoffDir,
      codexPromptPath: handoff.codexPromptPath,
      handoffMarkdownPath: handoff.handoffMarkdownPath,
      includedFiles: handoff.includedFiles,
      preflight: handoff.preflight.checks
    }
  });

  return await finalizeReport({
    outputDir,
    luaLogPath,
    snapshotDir,
    latestPath: bridge.written.latestPath,
    manifestPath: bridge.written.manifestPath,
    summaryPath,
    mapPath,
    handoffDir,
    handoffMarkdownPath: handoff.handoffMarkdownPath,
    codexPromptPath: handoff.codexPromptPath,
    question,
    intents,
    requiredModules,
    steps
  });
}

export function formatOfflineSmokeMarkdown(report: OfflineSmokeReport): string {
  const lines = [
    "# civ6-ai-copilot Offline Smoke",
    "",
    `- 状态：${report.ok ? "通过" : "失败"}`,
    `- 输出目录：${report.outputDir}`,
    `- 分析意图：${report.intents.join("、") || "通用局势"}`,
    `- 备注：${report.question}`,
    "",
    "## 产物",
    `- fake Lua.log: ${report.luaLogPath}`,
    `- snapshot dir: ${report.snapshotDir}`,
    `- latest.json: ${report.latestPath ?? "未生成"}`,
    `- latest-manifest.json: ${report.manifestPath ?? "未生成"}`,
    `- copilot-summary.md: ${report.summaryPath ?? "未生成"}`,
    `- visible-map.svg: ${report.mapPath ?? "未生成"}`,
    `- codex-prompt.md: ${report.codexPromptPath ?? "未生成"}`,
    `- copilot-handoff.md: ${report.handoffMarkdownPath ?? "未生成"}`,
    "",
    "## Steps",
    ...report.steps.map((step) => `- ${step.status}: ${step.id} - ${step.message}`)
  ];
  return `${lines.join("\n")}\n`;
}

async function finalizeReport(report: Omit<OfflineSmokeReport, "ok" | "reportPath">): Promise<OfflineSmokeReport> {
  const reportPath = path.join(report.outputDir, "offline-smoke-report.json");
  const finalReport: OfflineSmokeReport = {
    ...report,
    ok: report.steps.length > 0 && report.steps.every((step) => step.status === "pass"),
    reportPath
  };
  await writeFile(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  return finalReport;
}

function normalizedList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
