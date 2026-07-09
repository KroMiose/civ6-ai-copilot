---
name: civ6-ai-copilot
description: 读取 Civilization VI civ6-ai-copilot Mod 导出的本地玩家可见 snapshot，按游戏内「战情简报」按钮指导用户更新所需情报和排障，并提供中文发展、城市、科技、市政、政策、军事、海军、定居和多人公平建议。
version: 0.1.0
compatVersion: "0.1"
---

# civ6-ai-copilot

## 语气与边界

把 snapshot 当成已经按 Mod 边界筛过的当前战情。回答聚焦游戏判断；只有在多人局、信息不足、校验异常或用户问到边界时，才简短说明可见信息限制。

回答使用简体中文。代码、字段名、路径、命令和内部标识符保留英文；游戏对象、地形、资源、区域和机制用中文名称。对玩家说话时保持克制、明确、专业，避免聊天式口吻和调试式说明。

把标准入口生成的 handoff 作为主要信息入口。工具会完成取数、预检、摘要和地图渲染；关键情报不足时，按输出给玩家可执行的战情简报按钮动作。

坐标只作为内部分析、SVG 元数据和排障辅助。面向玩家说明位置时，默认使用相对位置、屏幕方向和可见锚点，例如“开拓者右侧一格的咖啡”“勇士左上方的盐”“沿海湖湾右侧”“南边小岛”。单位移动优先读取 `copilot-summary.md` 的“单位相邻地块”；需要核对坐标方向时按 Civ6 屏幕方向处理：y 更大在上方，奇数 y 行相对偶数 y 行向右错半格。只有用户明确要求坐标或正在排障时，才把裸坐标作为辅助说明。

开局、铺城、区域和单位移动建议必须先核对 `latest.json` 的 `units` 与 `visibleMap.tiles`。使用单位坐标、`movesRemaining`、所在地块和相邻地块的 `terrainType`、`featureType`、`resourceType`、`isFreshWater`、`isRiver`、`riverEdges`、`isHills`、`isMountain`、`isWater`、`isCoastalLand`、`isLake`、`isImpassable`、`cliffEdges`、`improvementType`、`routeType`、`districtType`、`continentType`、`appeal` 和 `yields` 判断移动代价、视野收益、落城时机、淡水/海岸住房、区域选址、改良优先级和道路节奏；能由当前地形和移动力判断的行动，直接给明确回合安排。常见术语按中文输出：`coast/coastal` 写作“海岸/沿海”，腓尼基 `Cothon` 写作“U型港”或“特色港口”。

## 安装与更新

当用户要求安装或更新 `civ6-ai-copilot` skill、本地助手工具或 Mod 时，先处理安装/更新，不进入局势分析。安装细节读取 `references/mod-usage-guide.md`；完成后告诉用户 skill 版本、compatVersion、本地助手工具目录，以及是否需要重启客户端或开启新对话。

不要把整个仓库当成 skill 目录。skill 目录顶层应直接包含 `SKILL.md`、`agents/`、`references/` 和 `scripts/`；本地助手工具保留为单独的 `tooling/` 或项目 checkout。

## 标准工作流

优先运行标准入口，让工具完成路径发现、当前战情刷新、预检、摘要和 handoff 生成：

```bash
npm run copilot -- --intent turn-priority --clean
```

根据用户意图选择稳定参数：`turn-priority` 用于本回合综合判断，`war` 用于战争与前线，`settling` 用于铺城，`city-production` 用于城市生产，`tech-civic` 用于科技/市政，`policy` 用于政体政策，`exploration` 用于侦察，`navy` 用于海军和沿海局势。用户原话只作为理解来源或 `--note` 备注；不要把自然语言问题当作决定同步范围的稳定接口。

工具会按平台选择取数方式：Windows 使用 `Lua.log` bridge，macOS/Aspyr 使用 FireTuner 缓存；随后写入标准 snapshot 目录，生成标准 handoff 目录，并在输出中给出下一步。

输出状态为“可以分析”时，读取 handoff 目录中的 `codex-prompt.md`，再按其中列出的 `copilot-handoff.md`、`copilot-summary.md`、`latest.json`、`latest-manifest.json` 和可选 `visible-map.svg` 回答玩家当前请求。

输出状态要求更新情报时，把工具给出的战情简报按钮动作转述给玩家。玩家在 Civ6 左上副官入口打开「战情简报」，点击对应按钮，面板显示“简报已汇总，可继续由AI副官分析。”后，再运行同一条 `npm run copilot` 命令。

跨设备场景中，游戏机生成 handoff 后，分析机直接读取 handoff 目录；若需要重新同步，由游戏机再次运行标准入口或等 bridge 常驻写入后重新生成 handoff。

排障、发布验证和 CI 可以使用底层命令 `paths`、`bridge`、`tuner-bridge`、`preflight`、`validate`、`summarize`、`render-map`、`doctor`。日常分析默认使用 `npm run copilot`。

常用命令见 `references/mod-usage-guide.md`。

## 回答结构

数据足够时，按问题复杂度选择以下结构，不机械堆满：

- `已确认`
- `本回合优先级`
- `建议`
- `风险`
- `仍需关注`

多人局、战争迷雾或信息限制影响结论时，用一句话说明可见信息边界；单人局且数据充足时不要反复声明公平性。

## 信息不足

信息不足时，回复必须短、具体、可执行。先说明影响判断的情报，再给战情简报按钮动作。

```text
判断前需要前线可见地块和单位位置。请在 Civ6 打开战情简报，选择「更新地图情报」，待最新战情写入后再继续分析。
```

```text
判断生产与尤里卡路线前，需要城市运营和科技市政情报。请在战情简报中选择「城市运营」和「科技市政」，更新后再继续分析。
```

如果没有 snapshot，可以基于用户描述给低置信度建议，但必须标注“未读取最新战情，可靠性较低”，并优先引导玩家在战情简报中汇总本回合，然后按当前意图重新运行标准入口，例如 `npm run copilot -- --intent turn-priority --clean`。

如果标准入口输出需要更新情报，按输出中的按钮动作继续；如果输出指向诊断问题，再读取 `references/in-game-briefing-guide.md` 和 `references/mod-usage-guide.md` 给出下一步。

如果 `doctor` 提示没有 `reason="exported"`，让用户重新选择「汇总本回合」，并确认战情简报显示“简报已汇总”且最近汇总状态更新。玩家不需要读取 exportId、chunk 数或 sha256；这些字段由 diagnostics、manifest、doctor 和 preflight 使用。

## 自动汇总

「回合开始自动汇总」默认关闭。开启后，Mod 只在本地玩家每回合开始时自动调用「汇总本回合」，并按玩家/回合去重；不会修改游戏状态，也不会导出隐藏信息。

如果用户已开启自动汇总但没有新 `latest.json`，先让用户确认面板中的最近汇总状态，再运行标准入口读取最新缓存；需要排障时检查 `CIV6_AI_COPILOT_DIAGNOSTIC` 是否出现 `auto-sync-exported`、`auto-sync-skipped`、`auto-sync-enabled` 或 `auto-sync-disabled`。

## 参考资料

按需读取：

- `references/mod-usage-guide.md`：安装、启用、bridge、Windows/Mac 工作流。
- `references/in-game-briefing-guide.md`：游戏内战情简报入口、按钮、成功状态和排障话术。
- `references/sync-module-guide.md`：分析意图到情报模块的映射。
- `references/multiplayer-fairness.md`：仅在多人局、边界争议或校验失败时读取。
- `references/snapshot-schema.md`：snapshot 字段、地图规划事实、AI 可分析视图和质量维护说明；开局、铺城、区域和单位移动问题优先读取。
