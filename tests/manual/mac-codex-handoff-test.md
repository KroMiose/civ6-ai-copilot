# Mac Agent Handoff 测试

用途：验证 Mac Agent 机器安装的是 Mod-first `civ6-ai-copilot` skill，并且 Agent 读取 handoff 后能先检查情报覆盖情况。

## 基本信息

```text
日期：
测试人：
macOS 版本：
Agent 客户端：
Mod/skill 版本：
handoff 来源：Windows 实机 / 离线 rehearsal
```

## 步骤

1. 在 Mac 副官机安装并验证 skill。

   ```bash
   npm run skill:install -- --clean
   npm run skill:validate-installed
   ```

   记录：

   ```text
   skill:validate-installed 是否通过：
   是否包含 references/mod-usage-guide.md：
   是否包含 references/sync-module-guide.md：
   是否包含 scripts/suggest-sync.mjs：
   ```

2. 验证 handoff 目录。

   ```bash
   npm run preflight -- --snapshot "<handoff-dir>/latest.json" --intent war
   npm run validate -- "<handoff-dir>/latest.json"
   npm run summarize -- --snapshot "<handoff-dir>/latest.json" --intent war
   ```

   记录：

   ```text
   preflight 是否通过：
   validate 是否通过：
   summarize 是否列出已确认信息和信息限制：
   如 manifest checksum/exportId 不一致，是否停止分析并要求重新 bridge：
   如关键模块未覆盖，是否输出战情简报动作：
   ```

3. 在 Agent 中读取 handoff。

   ```text
   是否先读取 codex-prompt.md：
   是否再读取 copilot-handoff.md：
   是否读取 copilot-summary.md/latest.json/latest-manifest.json：
   是否标注“本地玩家理论可见信息”：
   ```

4. 验证情报未覆盖时不盲答。

   用关键模块未覆盖的 handoff 或测试问题触发情报建议。期望 Agent 遵守“不要给最终局势结论”，只输出下一步战情简报动作。

   ```text
   是否没有输出最终开战/换卡/逐城结论：
   是否要求回战情简报点击具体按钮：
   是否说明更新后交回 handoff 目录或 latest.json：
   ```

5. 验证数据足够时的回答形态。

   ```text
   是否按“已确认 / 本回合优先级 / 建议 / 风险 / 信息限制”回答：
   是否没有推断隐藏地图、不可见单位、未遇见文明或其他玩家私人科技/市政/政策/城市队列：
   是否没有要求开启全知诊断或导出其他玩家私人信息：
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
  --output "<manual-evidence-draft.json>" \
  --format markdown

npm run evidence:finalize -- --input "<manual-evidence-draft.json>" --output "<manual-evidence.json>" --confirm-windows-smoke --confirm-multiplayer-fairness --confirm-mac-codex-copilot --confirm-artifact-scope --civ6-build "<civ6-build-id>" --format markdown
npm run evidence:validate -- --evidence "<manual-evidence.json>" --format markdown
```
