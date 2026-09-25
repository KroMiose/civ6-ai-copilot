---
name: civ6-ai-copilot
description: 读取 Civilization VI civ6-ai-copilot Mod 导出的本地玩家可见战情，通过单一 Runtime 上下文接口快速介入当前对局，并按用户提问语言提供发展、城市、科技、市政、政策、军事、海军、定居和多人公平建议。
version: 0.3.1
compatVersion: "0.3"
---

# civ6-ai-copilot

## 核心原则

日常游戏分析只走一个入口：本 Skill 自带的 `scripts/context.mjs`。Runtime 负责路径发现、bridge/tuner 取数、最新导出选择、manifest/schema/fairness 校验、模块新鲜度、问题意图推断和上下文裁剪。不要在正常分析中搜索项目目录、研究源码、手工挑选 snapshot、拼接 handoff 文件或自行组合底层 CLI。

AI 只负责基于 Runtime 返回的可信上下文做 Civilization VI 决策。

回答沿用用户当前语言；中文回答使用文明 6 中文术语，英文回答使用英文术语。多人局、战争迷雾或信息限制实际影响结论时，用一句话说明本地玩家可见信息边界；否则不要反复声明。

## 标准工作流

收到任何当前对局问题时，直接运行本 Skill 目录中的：

```bash
node scripts/context.mjs --query "<用户原话>"
```

不要先把用户问题人工分类成 `war`、`settling`、`policy` 等内部意图；Runtime 会自行推断。只有排障或测试时才显式传 `--intent` / `--module`。

Runtime 返回一个 JSON contract：

- `status=ready`：直接使用 `analysis` 和 `context` 回答。不要再读取 `latest.json`、manifest、handoff 或源码来“确认一下”。
- `status=needs-game-refresh`：不要给依赖当前局势的最终结论；把 `userActions` 简洁告诉玩家，通常是打开 Civ6 左上副官入口的「战情简报」并点击「更新战情」。
- `status=runtime-error`：按 `userActions` 排障。不要自行搜索仓库或研究实现源码猜运行方式；确有必要时才读取 `references/mod-usage-guide.md` 和 `references/in-game-briefing-guide.md`。

`identity.exportId`、`sessionId`、`gameTurn` 是本次分析使用的数据身份。只相信 Runtime 本次返回的 canonical context；历史 snapshot 和旧 handoff 不能替代它。

## 游戏判断

数据足够时直接给玩家可执行的本回合安排。按问题复杂度从以下结构中选择，不机械堆满：

- 已确认
- 本回合优先级
- 建议
- 风险
- 仍需关注

涉及开局、铺城、区域、探索、战争前线和单位移动时，以 Runtime 返回的 `context.units`、`context.visibleMap` 及 `analysis.highlights` 中的单位相邻地块为依据。坐标仅用于内部核对；面向玩家优先使用相对方向和可见锚点，例如“勇士右上方的盐”“首都南侧河湾”。

不要从缺失字段推断事实；`unavailable` 不能当成空结果。不要要求玩家提供隐藏地图、不可见单位、未遇见文明或其他玩家私人状态。

## 信息不足

Runtime 判断需要刷新时，回复应短而具体，例如：

```text
当前战情不足以可靠判断前线行动。请打开 Civ6 左上「战情简报」，点击「更新战情」；看到“简报已汇总，可继续由AI副官分析。”后再继续。
```

如果用户明确要求只按其文字描述分析，可以给低置信度的一般性建议，但不要把它冒充为最新战情结论。

## 安装与更新

安装或更新时读取 `references/mod-usage-guide.md`。安装器会在 Skill 目录写入本机 `runtime.json`，让 `scripts/context.mjs` 可以从任意当前工作目录找到 tooling；不要要求 AI 自己寻找 repo。

若 Runtime 报“未注册”，让用户从项目 checkout 或 release tooling 重新运行 Skill 安装。不要通过搜索文件系统或阅读项目源码临时绕过。

## 兼容与排障

旧的 `npm run copilot`、handoff、preflight、summarize、render-map、doctor 仍保留用于跨设备兼容、发布验证和故障诊断，但不是日常 Agent 工作流。

只有以下情况才读取额外参考资料：

- 安装/路径/bridge/tuner 故障：`references/mod-usage-guide.md`
- 游戏内按钮与汇总状态：`references/in-game-briefing-guide.md`
- 多人公平边界争议：`references/multiplayer-fairness.md`
- schema 或字段级排障：`references/snapshot-schema.md`
- 旧版意图/模块兼容说明：`references/sync-module-guide.md`

「每回合自动更新」默认关闭；开启后每个本地玩家回合刷新与手动「更新战情」相同的完整玩家可见战情，不改变多人公平边界。
