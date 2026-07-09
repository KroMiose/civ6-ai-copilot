# Windows 游戏机 + Mac Agent 工作流

推荐部署方式：Windows 机器运行 Civ6、Mod 和标准入口；Mac 机器运行 Codex、Claude Code 或其他 Agent，并使用 `civ6-ai-copilot` skill 做战情分析。标准入口会在 Windows 侧封装 bridge、预检和 handoff 生成。

```text
Windows 游戏机
  Civ6 + civ6-ai-copilot Mod
  -> npm run copilot
  -> snapshots/latest.json + handoff 目录
  -> 同步到 Mac

Mac 分析机
  Codex / Claude Code / Agent + civ6-ai-copilot skill
  -> 读取 codex-prompt.md
  -> 读取 copilot-handoff.md
  -> 校验、更新情报、分析
```

## Windows 侧

生成平台路径和脚本：

```bash
npm run paths -- --platform win32 --format markdown
npm run paths -- --platform win32 --format powershell > civ6-ai-copilot-windows-smoke.ps1
```

安装并验证：

```bash
npm run mod -- install --clean --mods-dir "<Windows Civ6 Mods dir>"
npm run smoke:offline -- --output-dir "%TEMP%\civ6-ai-copilot-offline-smoke" --clean
```

玩家在 Civ6 的 `Additional Content` 启用 Mod，进入对局，打开战情简报并点击「汇总本回合」。战争、定居、海军和前线问题再点击「更新地图情报」。

生成当前战情与 handoff：

```bash
npm run copilot -- \
  --platform win32 \
  --intent city-production \
  --clean
```

如 Civ6 用户目录、日志目录或同步目录被重定向，把 `npm run paths -- --platform win32 --format markdown` 输出中的路径参数加到同一条 `npm run copilot` 命令上。

需要常驻监听 `Lua.log` 的开发测试场景仍可单独运行 bridge；日常交给标准入口完成。

## Mac / Agent 侧

如果是普通玩家，优先让 Agent 按 [玩家使用指南](user-guide.md) 自动安装或更新 skill。开发者或 release bundle 测试者可手动安装并验证：

```bash
npm run skill:install -- --clean
npm run skill:validate-installed
```

验证同步过来的 handoff 时，优先读取 handoff 目录中的 `codex-prompt.md`。需要单独排障时再运行底层校验命令：

```bash
npm run preflight -- --snapshot "<handoff-dir>/latest.json" --intent city-production
npm run validate -- "<handoff-dir>/latest.json"
npm run summarize -- --snapshot "<handoff-dir>/latest.json" --intent city-production
npm run render-map -- --snapshot "<handoff-dir>/latest.json" --output "<handoff-dir>/visible-map.svg"
npm run suggest-sync -- --snapshot "<handoff-dir>/latest.json" --intent city-production
```

Agent 读取顺序：

1. `<handoff-dir>/codex-prompt.md`
2. `<handoff-dir>/copilot-handoff.md`
3. `<handoff-dir>/copilot-summary.md`
4. `<handoff-dir>/latest-manifest.json`
5. `<handoff-dir>/visible-map.svg`，若存在

如果 handoff 要求更新情报，回到 Windows 游戏中的战情简报点击指定按钮，再重新运行标准入口并同步 handoff 目录。

## Release bundle 脚本

统一发布包根目录提供两个脚本：

```bash
./civ6-ai-copilot-mac-copilot-smoke.sh
HANDOFF_DIR="<同步目录>/handoff" ./civ6-ai-copilot-mac-copilot-smoke.sh "这些城市接下来造什么？"
```

Windows 侧运行 `civ6-ai-copilot-windows-smoke.ps1`。如 Civ6 用户目录、Mods 目录或日志目录被重定向，可传 `-Civ6UserDataDir`、`-ModsDir`、`-LogsDir` 或 `-LuaLog`。

## 同步目录建议

推荐：

- Syncthing
- SMB 共享
- `scp` / `rsync`

可用但需自行管理访问范围：

- OneDrive
- iCloud
- Dropbox

Windows 本地运行标准入口，再同步完整 `latest.json` 和 handoff，比远程直接读取正在写入的 `Lua.log` 更稳定。

## 隔离要求

- 每个玩家使用独立 snapshot 输出目录。
- snapshot 必须包含 `sessionId`、`gameTurn`、`localPlayerId`、`exportId` 和 `visibilityMode: "player-visible"`。
- bridge 使用原子写入，Mac 侧读取 `latest.json` 时不应看到半写入文件。
- skill 不依赖 Civ6 进程，只依赖 snapshot、manifest、summary 和 handoff。
