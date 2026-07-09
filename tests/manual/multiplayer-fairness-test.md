# 多人公平手工测试

用途：验证两个真人玩家在同一局多人游戏中分别使用 `civ6-ai-copilot` 时，snapshot 只包含各自本地玩家理论可见信息。

## 基本信息

```text
日期：
测试人 A：
测试人 B：
Civ6 版本：
资料片/规则集：
地图/速度：
Mod 版本/提交：
是否双方都启用 civ6-ai-copilot：
```

## 测试设置

```text
A 文明/领袖：
B 文明/领袖：
是否初始未相遇：
是否存在 A 可见而 B 不可见的单位/地块：
是否存在 B 可见而 A 不可见的单位/地块：
```

## 玩家 A 快照

1. A 点击 `汇总本回合` 和 `更新地图情报`。
2. A 本机运行：

   ```bash
   npm run bridge -- --input-log "<A Lua.log>" --output-dir "<A snapshot dir>"
   npm run preflight -- --snapshot "<A snapshot dir>/latest.json" --intent war
   npm run validate -- "<A snapshot dir>/latest.json"
   npm run summarize -- --snapshot "<A snapshot dir>/latest.json" --intent war
   npm run render-map -- --snapshot "<A snapshot dir>/latest.json" --output "<A snapshot dir>/visible-map.svg"
   ```

3. A 检查：

   ```text
   preflight 是否通过或给出明确情报建议：
   validate 是否通过：
   localPlayerId 是否为 A：
   是否只出现 A 自己城市/单位：
   是否只出现 A 当前可见的 B 单位：
   是否没有 B 不可见/私人城市队列：
   是否没有 B 科技/市政/政策卡：
   是否没有未探索地块：
   是否没有未遇见玩家身份：
   visible-map.svg 是否只显示 A 可见 hex 地图/单位，且未渲染区域不被当成全图真相：
   如果 A 可见 B 单位，snapshot.units 是否包含该单位且 visibility=visible-now：
   ```

## 玩家 B 快照

1. B 点击 `汇总本回合` 和 `更新地图情报`。
2. B 本机运行：

   ```bash
   npm run bridge -- --input-log "<B Lua.log>" --output-dir "<B snapshot dir>"
   npm run preflight -- --snapshot "<B snapshot dir>/latest.json" --intent war
   npm run validate -- "<B snapshot dir>/latest.json"
   npm run summarize -- --snapshot "<B snapshot dir>/latest.json" --intent war
   npm run render-map -- --snapshot "<B snapshot dir>/latest.json" --output "<B snapshot dir>/visible-map.svg"
   ```

3. B 检查：

   ```text
   preflight 是否通过或给出明确情报建议：
   validate 是否通过：
   localPlayerId 是否为 B：
   是否只出现 B 自己城市/单位：
   是否只出现 B 当前可见的 A 单位：
   是否没有 A 不可见/私人城市队列：
   是否没有 A 科技/市政/政策卡：
   是否没有未探索地块：
   是否没有未遇见玩家身份：
   visible-map.svg 是否只显示 B 可见 hex 地图/单位，且未渲染区域不被当成全图真相：
   如果 B 可见 A 单位，snapshot.units 是否包含该单位且 visibility=visible-now：
   ```

## 交叉检查

```text
A snapshot 与 B snapshot 的 session 是否隔离：
A latest.json 是否没有覆盖 B latest.json：
B latest.json 是否没有覆盖 A latest.json：
同一隐藏单位是否没有出现在不可见方 snapshot：
战争/和平等公开外交信息是否只在已遇见后出现：
AI 副官是否标注“仅基于本地玩家理论可见信息”：
```

## 结论

```text
通过 / 未通过：
发现的公平性问题：
是否需要停止发布：
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
