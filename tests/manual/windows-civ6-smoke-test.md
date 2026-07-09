# Windows Civ6 Mod 冒烟测试

用途：验证 `civ6-ai-copilot` 能在 Windows 版 Civilization VI 中启用、进入对局、打开战情简报，并通过 `Lua.log -> bridge` 生成可校验的 `latest.json`。

本模板只记录结构化结论、版本和必要复现信息。

## 基本信息

```text
日期：
测试人：
Windows 版本：
Civ6 版本：
资料片/规则集：
Steam 模式：在线 / 离线
Mod 版本/提交：
Node 版本：
安装方式：手动复制 / npm run mod -- install / release bundle
```

## 步骤

1. 校验项目和 Mod 源目录。

   ```bash
   npm install
   npm run mod:validate
   ```

   记录：

   ```text
   mod:validate 是否通过：
   发现的问题：
   ```

2. 安装或打包 Mod。

   ```bash
   npm run mod -- install --clean
   ```

   或：

   ```bash
   npm run mod -- package --output-dir ./release --clean
   ```

   记录：

   ```text
   Civ6 Mods 目录下是否存在 civ6-ai-copilot/：
   .modinfo 是否位于该目录顶层：
   release manifest 是否存在：
   ```

3. 启动 Civ6，进入 `Additional Content`。

   记录：

   ```text
   是否能看到 Civ6 AI Copilot：
   是否能启用：
   是否出现影响规则/存档的提示：
   ```

4. 开始或加载一局测试游戏。

   记录：

   ```text
   是否进入游戏：
   左上 LaunchBar 是否出现副官入口：
   战情简报是否能打开：
   是否看到 XML 已加载/等待 Lua 初始化诊断；若出现，Lua 初始化后是否消失：
   面板文本是否正常本地化：
   ```

5. 点击战情按钮。

   必测：

   ```text
   汇总本回合：
   更新地图情报：
   城市运营：
   科技市政：
   完整战情简报：
   ```

   记录：

   ```text
   面板状态是否更新：
   是否出现卡死、断线或 gameplay 状态变化：
   战情简报是否显示“简报已汇总”，且最近汇总状态更新：
   玩家主面板是否未暴露 exportId、分块数或 sha256 前缀：
   ```

6. 运行诊断。

   ```bash
   npm run doctor -- \
     --input-log "%USERPROFILE%\Documents\My Games\Sid Meier's Civilization VI\Logs\Lua.log" \
     --modding-log "%USERPROFILE%\Documents\My Games\Sid Meier's Civilization VI\Logs\Modding.log" \
     --user-interface-log "%USERPROFILE%\Documents\My Games\Sid Meier's Civilization VI\Logs\UserInterface.log" \
     --database-log "%USERPROFILE%\Documents\My Games\Sid Meier's Civilization VI\Logs\Database.log" \
     --snapshot-dir "%USERPROFILE%\Documents\civ6-ai-copilot-snapshots" \
     --format markdown
   ```

   记录：

   ```text
   是否看到 CIV6_AI_COPILOT_LOADED：
   hasControls / hasGame / hasPlayers / hasMap 是否 true：
   base64SelfTest / sha256SelfTest 是否 true：
   是否出现 BEGIN/CHUNK/END：
   是否出现 reason=exported 诊断：
   exported 诊断中的 exportId/chunkCount/checksumSha256 是否合理：
   doctor 结果：
   ```

7. 运行 bridge。

   ```bash
   npm run bridge -- \
     --input-log "%USERPROFILE%\Documents\My Games\Sid Meier's Civilization VI\Logs\Lua.log" \
     --output-dir "%USERPROFILE%\Documents\civ6-ai-copilot-snapshots"
   ```

   记录：

   ```text
   是否生成 latest.json：
   是否生成 latest-manifest.json：
   ```

8. 校验副官材料。

   ```bash
   npm run preflight -- \
     --snapshot "%USERPROFILE%\Documents\civ6-ai-copilot-snapshots\latest.json" \
     --intent war
   npm run validate -- "%USERPROFILE%\Documents\civ6-ai-copilot-snapshots\latest.json"
   npm run summarize -- \
     --snapshot "%USERPROFILE%\Documents\civ6-ai-copilot-snapshots\latest.json" \
     --intent war
   npm run render-map -- \
     --snapshot "%USERPROFILE%\Documents\civ6-ai-copilot-snapshots\latest.json" \
     --output "%USERPROFILE%\Documents\civ6-ai-copilot-snapshots\visible-map.svg"
   ```

   记录：

   ```text
   preflight 是否通过或给出明确情报建议：
   validate 是否通过：
   summarize 是否列出回合、玩家、模块覆盖：
   render-map 是否生成 visible-map.svg：
   visible-map.svg 是否显示六边形格子、坐标、资源/单位/城市标记和玩家可见图例：
   是否出现未探索地图、不可见单位、未遇见文明或其他玩家私人状态：
   ```

## 结论

```text
通过 / 未通过：
阻塞问题：
可接受风险：
后续修复项：
```

生成结构化证据：

```bash
npm run evidence:draft -- \
  --input-log "<Lua.log>" \
  --snapshot-dir "<snapshot-dir>" \
  --handoff-dir "<handoff-dir>" \
  --player-a-snapshot "<player-a latest.json>" \
  --player-b-snapshot "<player-b latest.json>" \
  --output "<manual-evidence-draft.json>" \
  --format markdown

npm run evidence:finalize -- --input "<manual-evidence-draft.json>" --output "<manual-evidence.json>" --confirm-windows-smoke --confirm-multiplayer-fairness --confirm-mac-codex-copilot --confirm-artifact-scope --civ6-build "<civ6-build-id>" --format markdown
npm run evidence:validate -- --evidence "<manual-evidence.json>" --format markdown
```
