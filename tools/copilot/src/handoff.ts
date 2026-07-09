import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderSnapshotMapToFile, type RenderedMap } from "../../render-map/src/render-map.js";
import { runCopilotPreflight, type CopilotPreflightReport } from "./preflight.js";
import {
  formatSnapshotSummaryMarkdown,
  summarizeSnapshotFile,
  type SnapshotSummary
} from "./summarize-snapshot.js";

export interface CopilotHandoffOptions {
  snapshotPath?: string;
  snapshotDir?: string;
  outputDir: string;
  question?: string;
  intents?: string[];
  requiredModules?: string[];
  maxAgeMinutes?: number;
  clean?: boolean;
  includeSnapshot?: boolean;
  renderMap?: boolean;
}

export interface CopilotHandoffReport {
  ok: boolean;
  readyForCopilot: boolean;
  exitCode: number;
  generatedAt: string;
  outputDir: string;
  question?: string;
  intents: string[];
  requiredModules: string[];
  snapshotPath?: string;
  copiedSnapshotPath?: string;
  copiedManifestPath?: string;
  handoffMarkdownPath: string;
  handoffJsonPath: string;
  codexPromptPath: string;
  summaryMarkdownPath?: string;
  mapPath?: string;
  includedFiles: string[];
  skipped: string[];
  warnings: string[];
  preflight: CopilotPreflightReport;
  summary?: SnapshotSummary;
  renderedMap?: {
    counts: RenderedMap["counts"];
  };
}

export async function runCopilotHandoff(options: CopilotHandoffOptions): Promise<CopilotHandoffReport> {
  const outputDir = path.resolve(options.outputDir);
  if (options.clean) {
    await rm(outputDir, { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });

  const preflight = await runCopilotPreflight({
    snapshotPath: options.snapshotPath,
    snapshotDir: options.snapshotDir,
    question: options.question,
    intents: options.intents,
    requiredModules: options.requiredModules,
    maxAgeMinutes: options.maxAgeMinutes
  });
  const includedFiles: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [...preflight.warnings];
  let summary: SnapshotSummary | undefined;
  let renderedMap: CopilotHandoffReport["renderedMap"];
  let copiedSnapshotPath: string | undefined;
  let copiedManifestPath: string | undefined;
  let summaryMarkdownPath: string | undefined;
  let mapPath: string | undefined;

  if (preflight.snapshotPath && preflight.checks.snapshotFound) {
    summary = await summarizeSnapshotFile(preflight.snapshotPath, {
      question: options.question,
      intents: options.intents,
      requiredModules: options.requiredModules,
      allowInvalid: true
    });

    summaryMarkdownPath = path.join(outputDir, "copilot-summary.md");
    await writeFile(summaryMarkdownPath, formatSnapshotSummaryMarkdown(summary), "utf8");
    includedFiles.push(summaryMarkdownPath);

    if (options.includeSnapshot !== false) {
      copiedSnapshotPath = path.join(outputDir, "latest.json");
      await copyIfDifferent(preflight.snapshotPath, copiedSnapshotPath);
      includedFiles.push(copiedSnapshotPath);

      if (preflight.manifestPath && preflight.checks.manifestFound) {
        copiedManifestPath = path.join(outputDir, "latest-manifest.json");
        await copyIfDifferent(preflight.manifestPath, copiedManifestPath);
        includedFiles.push(copiedManifestPath);
      } else {
        skipped.push("latest-manifest.json 未找到，handoff 只包含 snapshot 副本。");
      }
    } else {
      skipped.push("includeSnapshot=false，handoff 未复制 latest.json。");
    }

    if (options.renderMap !== false && summary.validation.ok && summary.coverage.counts.visibleTiles > 0) {
      try {
        mapPath = path.join(outputDir, "visible-map.svg");
        const map = await renderSnapshotMapToFile(preflight.snapshotPath, mapPath);
        renderedMap = { counts: map.counts };
        includedFiles.push(mapPath);
      } catch (error) {
        warnings.push(`visible-map.svg 渲染失败：${(error as Error).message}`);
      }
    } else if (options.renderMap === false) {
      skipped.push("renderMap=false，未渲染 visible-map.svg。");
    } else if (!summary.validation.ok) {
      skipped.push("snapshot 未通过 schema/fairness 校验，未渲染地图以避免基于不合规数据展示局势。");
    } else {
      skipped.push("snapshot 没有 visibleMap.tiles，未渲染 visible-map.svg。");
    }
  } else if (preflight.snapshotPath) {
    skipped.push("snapshot 存在但无法解析，handoff 只写入修复指引。");
  } else {
    skipped.push("没有可读取的 snapshot，handoff 只写入情报更新指引。");
  }

  const handoffMarkdownPath = path.join(outputDir, "copilot-handoff.md");
  const handoffJsonPath = path.join(outputDir, "copilot-handoff.json");
  const codexPromptPath = path.join(outputDir, "codex-prompt.md");
  includedFiles.unshift(handoffMarkdownPath, handoffJsonPath, codexPromptPath);
  const report: CopilotHandoffReport = {
    ok: true,
    readyForCopilot: preflight.canAnalyze,
    exitCode: preflight.exitCode,
    generatedAt: new Date().toISOString(),
    outputDir,
    question: options.question,
    intents: preflight.intents,
    requiredModules: preflight.requiredModules,
    snapshotPath: preflight.snapshotPath,
    copiedSnapshotPath,
    copiedManifestPath,
    handoffMarkdownPath,
    handoffJsonPath,
    codexPromptPath,
    summaryMarkdownPath,
    mapPath,
    includedFiles,
    skipped,
    warnings,
    preflight,
    summary,
    renderedMap
  };

  const markdown = formatCopilotHandoffMarkdown(report);
  await writeFile(handoffMarkdownPath, markdown, "utf8");
  await writeFile(handoffJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(codexPromptPath, formatCodexPromptMarkdown(report), "utf8");

  return report;
}

export function formatCopilotHandoffMarkdown(report: CopilotHandoffReport): string {
  const status = report.readyForCopilot
    ? "可以交给 Mac Agent 分析"
    : report.preflight.exitCode === 2
      ? "需要先回 Civ6 更新情报"
      : "不可分析，需要先修正输入";
  const lines = [
    "# Civ6 AI Copilot Handoff",
    "",
    `- 状态：${status}`,
    `- 生成时间：${report.generatedAt}`,
    `- 分析意图：${report.intents.join("、") || "通用局势"}`,
    `- 备注：${report.question ?? "未指定"}`,
    `- 输出目录：${report.outputDir}`,
    `- snapshot：${report.copiedSnapshotPath ?? report.snapshotPath ?? "未找到"}`,
    `- manifest：${report.copiedManifestPath ?? (report.preflight.checks.manifestFound ? report.preflight.manifestPath : "未找到")}`,
    "",
    "## 给 Mac Agent",
    "- 先读取本目录的 `codex-prompt.md`，再读取 `copilot-handoff.md`、`copilot-summary.md` 和 `latest.json`。",
    "- 校验通过时直接进入游戏判断；只有多人局、信息不足、校验异常或用户询问边界时，才简短说明可见信息限制。",
    "- 坐标只用于内部核对和 SVG 元数据；回复玩家时必须改成相对位置、屏幕方向和游戏可见锚点，不要把裸坐标作为主要位置说明。",
    "- 开局、铺城、区域和单位移动建议必须核对 `latest.json` 中 `units` 与 `visibleMap.tiles` 的地形、地貌、资源、淡水、河流边、悬崖、改良、路线、区域、吸引力和产出。",
    "- 如果状态是“需要先回 Civ6 更新情报”，请把“下一步”里的战情简报操作发给玩家，等新的 `latest.json` 写入后再分析。",
    ""
  ];

  if (report.summary) {
    lines.push(
      "## 快照摘要",
      `- 第 ${report.summary.snapshot.gameTurn} 回合，${report.summary.snapshot.isMultiplayer ? "多人局" : "单人局"}，${report.summary.snapshot.ruleset} / ${report.summary.snapshot.gameSpeed} / ${report.summary.snapshot.mapSize}`,
      `- 本地玩家：${report.summary.localPlayer.leaderType} / ${report.summary.localPlayer.civilizationType}（player ${report.summary.localPlayer.localPlayerId}）`,
      `- 分析意图：${report.summary.syncAdvice.intents.join("、") || "通用局势"}`,
      `- 模块：${report.summary.coverage.availableModules.join("、") || "无"}`,
      `- 计数：${report.summary.coverage.counts.cities} 城，${report.summary.coverage.counts.ownUnits} 个自有单位，${report.summary.coverage.counts.visibleForeignUnits} 个当前可见外方单位，${report.summary.coverage.counts.visibleTiles} 个可见/已揭示地块`,
      `- 情报建议：${report.summary.syncAdvice.recommendation}`,
      ""
    );
  }

  lines.push(
    "## 预检",
    `- schema：${report.preflight.checks.validationOk ? "通过" : "失败"}`,
    `- 数据边界：${report.preflight.checks.fairnessOk ? "通过" : "失败"}`,
    `- manifest：${report.preflight.checks.manifestFound ? report.preflight.checks.manifestConsistent === false ? "不一致" : "已找到" : "未找到"}`,
    `- 情报覆盖：${report.preflight.checks.syncOk ? "覆盖当前意图" : "当前意图所需情报未覆盖"}`,
    `- 新鲜度：${report.preflight.checks.freshnessOk ? "通过" : "失败"}`,
    ""
  );

  appendSection(lines, "阻塞", report.preflight.issues);
  appendSection(lines, "提醒", report.warnings);
  appendSection(lines, "下一步", report.preflight.nextActions);
  appendSection(lines, "已包含文件", report.includedFiles.map((file) => path.basename(file)));
  appendSection(lines, "已跳过", report.skipped);

  return `${lines.join("\n")}\n`;
}

export function formatCodexPromptMarkdown(report: CopilotHandoffReport): string {
  const filesToRead = [
    "copilot-handoff.md",
    report.summaryMarkdownPath ? "copilot-summary.md" : undefined,
    report.copiedSnapshotPath ? "latest.json" : undefined,
    report.copiedManifestPath ? "latest-manifest.json" : undefined,
    report.mapPath ? "visible-map.svg" : undefined
  ].filter((value): value is string => Boolean(value));
  const lines = [
    "# Agent Prompt",
    "",
    "你是 civ6-ai-copilot。请用简体中文和文明 6 中文术语回答，直接给玩家可执行的游戏判断。",
    "",
    "## 当前任务",
    `- 分析意图：${report.intents.join("、") || "通用局势"}`,
    `- 用户备注：${report.question ?? "未指定"}`,
    `- handoff 状态：${report.readyForCopilot ? "可以分析" : report.preflight.exitCode === 2 ? "需要先回 Civ6 更新情报" : "不可分析"}`,
    "",
    "## 先读取",
    ...filesToRead.map((file) => `- \`${file}\``),
    "",
    "## 决策规则",
    "- 如果 `copilot-handoff.md` 的状态是“需要先回 Civ6 更新情报”，不要给最终局势结论；把“下一步”里的战情简报按钮动作发给用户。",
    "- 如果 `latest-manifest.json` 不存在，在不依赖 manifest 的场景可以继续有限分析，并建议常驻 bridge；如果 manifest checksum/exportId 不一致，停止分析并要求重新运行 bridge。",
    "- 如果 schema/fairness 校验失败，停止分析，不要基于该 snapshot 提供战术或政策建议。",
    "- `latest.json`、`copilot-summary.md` 和 `visible-map.svg` 里的坐标只用于内部核对；回复玩家时改成相对位置、屏幕方向和游戏可见锚点，例如“首都右侧沿海的玉米旁”“勇士所在海岸右上方”。单位移动优先读取 `copilot-summary.md` 的“单位相邻地块”；需要核对坐标方向时按 Civ6 屏幕方向处理：y 更大在上方，奇数 y 行相对偶数 y 行向右错半格。",
    "- 开局、铺城、区域和单位移动建议必须核对 `latest.json` 中 `units` 与 `visibleMap.tiles` 的地形、地貌、资源、淡水、河流边、悬崖、改良、路线、区域、吸引力和产出；不要只凭 SVG 或常识猜移动收益。",
    "- 游戏对象使用中文名；例如 `coast/coastal` 写“海岸/沿海”，腓尼基 `Cothon` 写“U型港”或“特色港口”。",
    "- 多人局、战争迷雾或信息限制影响结论时，用一句话说明可见信息边界；单人局且数据充足时不要反复声明公平性。",
    "- 如果数据足够，按“已确认 / 本回合优先级 / 建议 / 风险 / 信息限制”回答。",
    ""
  ];

  if (!report.readyForCopilot) {
    lines.push(
      "## 当前建议动作",
      ...report.preflight.nextActions.map((action) => `- ${action}`),
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

async function copyIfDifferent(sourcePath: string, destinationPath: string): Promise<void> {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedDestination = path.resolve(destinationPath);
  if (resolvedSource === resolvedDestination) {
    return;
  }
  await copyFile(resolvedSource, resolvedDestination);
}

function appendSection(lines: string[], title: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }
  lines.push(`## ${title}`, ...items.map((item) => `- ${item}`), "");
}
