# Mod 与 Skill 使用参考

本参考供 skill 在安装、更新、情报汇总、排障和跨设备 handoff 时使用。普通玩家的完整教程以仓库 `docs/user-guide.md` 为准。

## 安装与更新

普通玩家优先通过 Steam Workshop 安装 `Civ6 AI Copilot`，并在 Civ6 `Additional Content` 中启用。玩家安装与更新话术以仓库 `docs/user-guide.md` 为准；本参考不复制完整安装流程。

当用户需要安装或更新 Agent Skill 与本地助手工具时，按玩家指南确认来源、skill 版本、compatVersion、本地助手工具目录，以及是否需要重启客户端或开启新对话。

skill 目录名保持 `civ6-ai-copilot`，顶层直接包含 `SKILL.md`。本地助手工具保留为单独的 `tooling/` 或项目 checkout。

开发者手动安装 Mod 时，可使用：

```bash
npm run mod -- install --clean
```

发布目录：

```bash
npm run mod -- package --output-dir ./release --clean
```

## 战情简报按钮

- 入口在 Civ6 左上 LaunchBar 的副官按钮。打开后面板标题是「战情简报」，状态区会显示当前状态和「最近汇总：…」。
- 手动按钮只有「更新战情」：刷新完整战情，包括地图、己方城市与单位、总督、商路和已遇见城邦信息。玩家按需点击该按钮即可；无需选择专题按钮。
- 面板成功状态应显示「简报已汇总，可继续由AI副官分析。」。让玩家确认这个状态即可，不要求读取技术字段。
- `每回合自动更新`：默认关闭；开启后在本地玩家回合开始后刷新完整战情和当前可见地图，范围与手动「更新战情」相同。面板显示更新状态和进度，无需处理技术细节。

玩家面板只显示汇总状态。`exportId`、chunk 数、checksum、manifest 和诊断细节由日志与桌面工具核对，不要求玩家读取。

## 标准入口

日常 Agent 分析使用安装后的 wrapper。原话不决定读取哪些模块；Agent 按 `SKILL.md` 的清单自己传 `--module`。不传则返回最后一次成功汇总里的全部模块。

```bash
node scripts/context.mjs --module cities --module units --module visibleMap --adjacent-units --render-map "<输出路径>/visible-map.svg"
```

wrapper 从 Skill 安装时生成的 `runtime.json` 定位 tooling，因此不依赖当前工作目录。Runtime 读取游戏里最后一份写完的导出，校验后按点名的模块返回 JSON。

- `status=ready`：用返回的 `context` 回答。`gaps` 里的 `unavailable` 不能当成空结果。
- `status=needs-game-refresh`：只有游戏里还没有写完的导出时才出现。转述 `userActions`。
- `status=runtime-error`：按错误动作排障，不要搜索源码或历史 snapshot。

开发者可直接运行：

```bash
npm run context -- --query "这回合应该做什么？"
```

旧的 `npm run copilot -- --intent turn-priority --clean` 继续保留给跨设备 handoff、发布验证和兼容工作流。

## 底层命令

Windows 或能写 `Lua.log` 的环境：

```bash
npm run bridge -- --input-log "<Lua.log>" --output-dir "<snapshot-dir>" --watch
```

macOS/Aspyr 无 `Lua.log` 的环境：

```bash
npm run tuner-bridge -- --output-dir "<snapshot-dir>" --state civ6_ai_copilot
```

预检：

```bash
npm run preflight -- \
  --snapshot "<snapshot-dir>/latest.json" \
  --intent war
```

摘要：

```bash
npm run summarize -- \
  --snapshot "<snapshot-dir>/latest.json" \
  --intent war
```

地图相关：

```bash
npm run render-map -- \
  --snapshot "<snapshot-dir>/latest.json" \
  --output "<snapshot-dir>/visible-map.svg"
```

`visible-map.svg` 只表示玩家可见或已揭示范围，不是全图真相。

诊断：

```bash
npm run doctor -- --input-log "<Lua.log>" --snapshot-dir "<snapshot-dir>" --format markdown
```

真实游戏排障可加 `--modding-log "<Modding.log>" --user-interface-log "<UserInterface.log>" --database-log "<Database.log>"`。如果 doctor 显示导出诊断与最新快照不匹配，要求重新汇总后再分析。

## Windows 游戏机 + Mac Agent

推荐流程：

1. Windows 运行 Civ6、启用 Mod，进入对局。
2. 玩家在战情简报中汇总或更新情报。
3. Windows 运行标准入口生成 snapshot 与 handoff：

   ```bash
   npm run copilot -- --intent turn-priority --clean
   ```

4. Mac 侧 Agent 先读取 `<handoff-dir>/codex-prompt.md`，再读取 `copilot-handoff.md`、`copilot-summary.md`、`latest.json`、`latest-manifest.json` 和可选 `visible-map.svg`。

如果 handoff 要求更新情报，照其中的战情简报按钮让用户回 Windows 操作，再重新运行标准入口并同步 handoff。

## 信息不足时的回复

当关键情报不足时，不输出最终建议。示例：

```text
当前快照未覆盖前线可见地块和单位位置，因此不能可靠判断是否开战。请在 Civ6 打开战情简报，点击「更新战情」，待 latest.json 更新后再继续分析。
```

只有 Mod 当前无法覆盖该信息，或诊断表明对应 Civ6 API 不可用时，才请求额外说明或图像材料。

更完整的游戏内面板说明、按钮组合和排障话术见 `references/in-game-briefing-guide.md`。
