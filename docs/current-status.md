# 发布就绪状态

本文记录 `civ6-ai-copilot` 当前版本的 release readiness。它面向发布前检查和测试交接，不作为开发日志。

## 当前版本

- 项目版本：`0.3.7`
- 兼容版本：`0.3`
- 协议版本：`0.3.0`
- Schema 版本：`0.3.0`
- 分发目标：GitHub release、Steam Workshop Mod、Agent Skill package、统一 release bundle

版本来源是仓库根目录的 `project-version.json`。Mod、skill、schema 和协议读取同一个版本源，避免在多个文件中硬编码。

0.3.7 导出可见单位的征召归属、可读局面信息，以及不受 1024 格详细地块上限约束的世界索引。Steam Workshop 不在本版更新。Windows/Aspyr 实机验证和双人多人公平测试仍待完成，离线验证不能替代这些手工门槛。

## 当前能力

- Civ6 被动 InGame UI Mod，`AffectsSavedGames=0`。
- 左上 LaunchBar 副官入口与中文面板。
- 唯一手动完整按钮「更新战情」，刷新所有当前已实现模块。
- 默认关闭的「每回合自动更新」；开启后每个本地玩家回合刷新全部已实现模块，包含预算限制的可见地图。
- `Lua.log` marker bridge 与 macOS/Aspyr `tuner-bridge` 读取缓存通道。
- Snapshot schema、fairness 校验、doctor、preflight、summary、visible map render、handoff。
- 单次调用的 Agent context Runtime：读取最后一次成功汇总，按 Agent 点名的模块返回；旧 handoff 链保留给排障和跨机流程。
- Agent Skill 安装、校验、打包和 Mod-first 情报更新引导。
- Mod package、skill package、release bundle、manual evidence 和 RC gate。

## 已验证路径

2026-09-25，0.3.1 本地收尾验证：199/199 自动化测试通过；构建、类型检查、Mod/Skill 校验、RC 自动 gate、离线闭环与隐私检查通过，依赖审计未发现漏洞。普通 Mods 与本地 Workshop 副本已更新为 0.3.1，并逐文件核对安装包；已安装 Skill 校验通过，旧版已备份。游戏内视觉和真实回合行为仍需重启 Civ6 后验证。GitHub 预发布 `v0.3.1` 已存在，但不包含随后合并的 context Runtime；`v0.3.2` 用来发布这次 Skill 和本地工具。

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

该闭环使用示例 fixture 跑通 fake `Lua.log -> bridge -> doctor -> preflight -> summarize -> render-map -> handoff`；Agent 日常入口另由 `npm run context -- --query "<question>"` 覆盖，用于在真实游戏测试前确认本机工具链和协议实现。

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
- Agent 日常分析优先使用 context Runtime 返回的 `context.visibleMap`；`visible-map.svg` 主要用于人工核对和兼容 handoff，且只代表本地玩家可见/已揭示范围。
- 公开 issue 或 release note 只需要版本、命令、错误摘要和可复现步骤；本地采集材料留在测试环境。
