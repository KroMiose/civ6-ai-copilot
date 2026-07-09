# 开发者手动安装与测试运行簿

本文面向开发者、内测者和发布负责人，用于手动安装 `civ6-ai-copilot`、生成 snapshot、诊断导出链路，并完成 release candidate 所需的手工测试。普通玩家优先使用 Steam Workshop 和 [玩家使用指南](user-guide.md)。

## 1. 本地准备

```bash
npm install
npm run smoke:offline -- --output-dir /tmp/civ6-ai-copilot-offline-smoke --clean
npm run mod:validate
```

`smoke:offline` 使用示例 fixture 跑通 fake `Lua.log -> bridge -> doctor -> preflight -> summarize -> render-map -> handoff`。它不启动 Civ6，适合先确认 Node 工具链和仓库文件。

`mod:validate` 会检查 `.modinfo`、Additional Content 元数据、InGame UI action、`AffectsSavedGames=0`、UI XML/Lua 配对、Lua marker、中文面板文本和被动导出边界。

## 2. 手动安装 Mod

默认安装：

```bash
npm run mod -- install --clean
```

指定 Windows Mods 目录：

```bash
npm run mod -- install --clean --mods-dir "%USERPROFILE%\Documents\My Games\Sid Meier's Civilization VI\Mods"
```

手动安装时，目标目录应为：

```text
%USERPROFILE%\Documents\My Games\Sid Meier's Civilization VI\Mods\civ6-ai-copilot\
```

目录结构：

```text
civ6-ai-copilot/
├── civ6-ai-copilot.modinfo
├── text/
│   └── civ6-ai-copilot-text.xml
└── ui/
    ├── civ6_ai_copilot.xml
    └── civ6_ai_copilot.lua
```

生成可复制发布目录：

```bash
npm run mod -- package --output-dir ./release --clean
```

## 3. 游戏内检查

1. 启动 Civ6。
2. 打开 `Additional Content`，启用 `Civ6 AI Copilot`。
3. 开始或加载一局游戏。
4. 确认左上 LaunchBar 出现副官入口。
5. 打开战情简报，点击「汇总本回合」。
6. 对地图、战争、海军、定居问题，点击「更新地图情报」。
7. 需要更新专题情报时，选择「城市运营」「军事态势」「科技市政」「政体政策」「资源库存」或「公开外交」。

玩家面板只显示玩家可理解的汇总状态；`exportId`、chunk 数、checksum、manifest 和 bridge 细节由日志与桌面工具核对。

## 4. Windows bridge

生成推荐路径和 Windows 脚本：

```bash
npm run paths -- --platform win32 --format markdown
npm run paths -- --platform win32 --format powershell > civ6-ai-copilot-windows-smoke.ps1
```

读取真实 `Lua.log`：

```bash
npm run bridge -- \
  --input-log "%USERPROFILE%\Documents\My Games\Sid Meier's Civilization VI\Logs\Lua.log" \
  --output-dir "%USERPROFILE%\Documents\civ6-ai-copilot-snapshots" \
  --watch
```

一次性读取时去掉 `--watch`。

## 5. macOS/Aspyr tuner-bridge

macOS/Aspyr 环境可能没有 `Lua.log`。在游戏内战情简报完成汇总后，使用：

```bash
npm run tuner-bridge -- --output-dir "<snapshot-dir>" --state civ6_ai_copilot
```

列出可用 Lua state：

```bash
npm run tuner-bridge -- --output-dir "<snapshot-dir>" --list-states
```

`tuner-bridge` 只读取 `ExposedMembers.Civ6AICopilot.latestExport` 中已经缓存的 marker 分块。若缓存为空，回到游戏内选择对应战情按钮。

## 6. 诊断与预检

真实游戏排障建议同时传入 Civ6 日志：

```bash
npm run doctor -- \
  --input-log "<Lua.log>" \
  --modding-log "<Modding.log>" \
  --user-interface-log "<UserInterface.log>" \
  --database-log "<Database.log>" \
  --snapshot-dir "<snapshot-dir>" \
  --format markdown
```

验证并生成分析材料：

```bash
npm run validate -- "<snapshot-dir>/latest.json"
npm run preflight -- --snapshot-dir "<snapshot-dir>" --intent war --format markdown
npm run summarize -- --snapshot "<snapshot-dir>/latest.json" --intent war
npm run render-map -- --snapshot "<snapshot-dir>/latest.json" --output "<snapshot-dir>/visible-map.svg"
```

`visible-map.svg` 是玩家可见 hex map 辅助材料，不代表全图真相；未渲染区域表示未知、未揭示或未导出。

## 7. Handoff

Windows 游戏机与 Mac Agent 分离时，生成交接目录：

```bash
npm run handoff -- \
  --snapshot-dir "<snapshot-dir>" \
  --output-dir "<handoff-dir>" \
  --intent war \
  --clean
```

handoff 目录包含 `codex-prompt.md`、`copilot-handoff.md`、`copilot-summary.md`、`latest.json`、`latest-manifest.json` 和可选 `visible-map.svg`。Agent 先读 `codex-prompt.md`，再读 `copilot-handoff.md`。

## 8. Release bundle

生成统一测试包：

```bash
npm run release:package -- --output-dir ./release --clean
npm run release:validate -- --bundle-dir ./release/civ6-ai-copilot-release
```

Bundle 根目录包含：

- `civ6-ai-copilot-windows-smoke.ps1`
- `civ6-ai-copilot-mac-copilot-smoke.sh`
- `mod/civ6-ai-copilot/`
- `skill/civ6-ai-copilot/`
- `tooling/`
- `manual-tests/`
- `docs/`
- release manifest 与 checklist

Mac 端验证 skill/handoff：

```bash
./civ6-ai-copilot-mac-copilot-smoke.sh
HANDOFF_DIR="<handoff-dir>" ./civ6-ai-copilot-mac-copilot-smoke.sh "我现在该不该开战？"
```

## 9. 手工测试记录

使用以下模板：

- `tests/manual/windows-civ6-smoke-test.md`
- `tests/manual/multiplayer-fairness-test.md`
- `tests/manual/mac-codex-handoff-test.md`
- `tests/manual/manual-evidence-template.json`

生成证据：

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

`evidence:draft` 预填机器可证明字段；`evidence:finalize` 记录人工确认项；`evidence:validate` 和 `rc:check` 用于 release gate。
