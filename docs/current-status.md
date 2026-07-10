# 发布就绪状态

本文记录 `civ6-ai-copilot` 当前版本的 release readiness。它面向发布前检查和测试交接，不作为开发日志。

## 当前版本

- 项目版本：`0.1.1`
- 兼容版本：`0.1`
- 协议版本：`0.1.0`
- Schema 版本：`0.1.0`
- 分发目标：GitHub release、Steam Workshop Mod、Agent Skill package、统一 release bundle

版本来源是仓库根目录的 `project-version.json`。Mod、skill、schema 和协议读取同一个版本源，避免在多个文件中硬编码。

## 当前能力

- Civ6 被动 InGame UI Mod，`AffectsSavedGames=0`。
- 左上 LaunchBar 副官入口与中文面板。
- 「汇总本回合」「更新地图情报」「城市运营」「军事态势」「科技市政」「政体政策」「资源库存」「公开外交」「完整战情简报」。
- 默认关闭的「回合开始自动汇总」，在本地玩家回合开始后排队复用同一导出路径，并显示扫描、校验和写入进度。
- `Lua.log` marker bridge 与 macOS/Aspyr `tuner-bridge` 读取缓存通道。
- Snapshot schema、fairness 校验、doctor、preflight、summary、visible map render、handoff。
- Agent Skill 安装、校验、打包和 Mod-first 情报更新引导。
- Mod package、skill package、release bundle、manual evidence 和 RC gate。

## 已验证路径

自动化验证覆盖：

```bash
npm run typecheck
npm test
npm run mod:validate
npm run skill:validate
npm run privacy:check
npm run rc:check -- --format markdown
```

离线闭环覆盖：

```bash
npm run smoke:offline -- --output-dir /tmp/civ6-ai-copilot-offline-smoke --clean
```

该闭环使用示例 fixture 跑通 fake `Lua.log -> bridge -> doctor -> preflight -> summarize -> render-map -> handoff`，用于在真实游戏测试前确认本机工具链和协议实现。

实机路径支持：

- Windows 或有 `Lua.log` 的环境：战情简报汇总后运行 `bridge`，写出 `latest.json`。
- macOS/Aspyr 无 `Lua.log` 的环境：战情简报汇总后运行 `tuner-bridge`，读取 Mod 已缓存的同一份 marker 分块。

## 发布前 gate

自动 gate：

- `npm run mod:validate`
- `npm run skill:validate`
- `npm run privacy:check`
- `npm run rc:check -- --format markdown`
- `npm run release:package -- --output-dir ./release --clean`
- `npm run release:validate -- --bundle-dir ./release/civ6-ai-copilot-release`

手工 gate：

- Windows Civ6 加载与 `Lua.log` bridge 冒烟测试。
- 两名真人玩家同一局的多人公平交叉检查。
- Mac Agent handoff 测试。
- 结构化 `manual-evidence.json` 通过 `evidence:validate`。

手工证据流程：

```bash
npm run evidence:draft -- \
  --input-log "<Lua.log>" \
  --snapshot-dir "<snapshot-dir>" \
  --handoff-dir "<handoff-dir>" \
  --player-a-snapshot "<player-a latest.json>" \
  --player-b-snapshot "<player-b latest.json>" \
  --output "<manual-evidence-draft.json>" \
  --format markdown

npm run evidence:finalize -- \
  --input "<manual-evidence-draft.json>" \
  --output "<manual-evidence.json>" \
  --confirm-windows-smoke \
  --confirm-multiplayer-fairness \
  --confirm-mac-codex-copilot \
  --confirm-artifact-scope \
  --civ6-build "<civ6-build-id>" \
  --format markdown

npm run evidence:validate -- --evidence "<manual-evidence.json>" --format markdown
npm run rc:check -- --manual-evidence "<manual-evidence.json>" --format markdown
```

## 维护注意点

- 快照字段、UI 模块名、skill 情报更新提示和 schema 必须同步演进。
- `a.b.c` 版本规则中，`a.b` 必须兼容；patch 变化允许继续分析但可提示更新。
- 地图、战争、海军、定居问题优先使用 `visible-map.svg`，但它只代表本地玩家可见/已揭示范围。
- 公开 issue 或 release note 只需要版本、命令、错误摘要和可复现步骤；本地采集材料留在测试环境。
