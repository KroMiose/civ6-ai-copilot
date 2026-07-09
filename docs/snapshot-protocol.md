# Snapshot 协议

`civ6-ai-copilot` 使用 marker 分块协议把 Civ6 UI Mod 汇总出的本地玩家可见 snapshot 传给桌面工具。Windows 和 macOS/Aspyr 共享同一套 marker、checksum、schema、fairness 和 writer 逻辑。

## 1. 传输路径

Windows 或有 `Lua.log` 的环境：

```text
战情简报 -> Lua print marker -> Lua.log -> bridge -> latest.json
```

macOS/Aspyr 无 `Lua.log` 的环境：

```text
战情简报 -> ExposedMembers.Civ6AICopilot.latestExport -> tuner-bridge -> latest.json
```

`tuner-bridge` 只读取 Mod 已缓存的 marker 分块，不触发新的采集，也不调用玩法修改 API。

## 2. Marker 格式

每次导出包含一组 sentinel 行。sentinel 后接 JSON object。

```text
CIV6_AI_COPILOT_SNAPSHOT_BEGIN {...}
CIV6_AI_COPILOT_SNAPSHOT_CHUNK {...}
CIV6_AI_COPILOT_SNAPSHOT_CHUNK {...}
CIV6_AI_COPILOT_SNAPSHOT_END {...}
```

加载、自检、入口挂载和导出完成使用诊断行：

```text
CIV6_AI_COPILOT_LOADED version=0.1.0
CIV6_AI_COPILOT_DIAGNOSTIC {...}
```

导出完成诊断使用 `reason: "exported"`，并包含：

```json
{
  "reason": "exported",
  "exportId": "civ6ai-42-0-1783330000",
  "chunkCount": 12,
  "byteLength": 8192,
  "checksumSha256": "hex-string"
}
```

玩家面板不展示这些技术字段；doctor、manifest 和 preflight 使用它们核对导出完整性。

## 3. BEGIN / CHUNK / END

`BEGIN` payload：

```json
{
  "protocolVersion": "0.1.0",
  "exportId": "civ6ai-42-0-1783330000",
  "schemaVersion": "0.1.0",
  "chunkCount": 12,
  "byteLength": 8192,
  "checksumSha256": "hex-string",
  "encoding": "base64-json",
  "createdAt": "2026-07-06T08:00:00Z"
}
```

`CHUNK` payload：

```json
{
  "exportId": "civ6ai-42-0-1783330000",
  "index": 0,
  "data": "base64..."
}
```

`END` payload：

```json
{
  "exportId": "civ6ai-42-0-1783330000"
}
```

## 4. Bridge 校验

`bridge` 和 `tuner-bridge` 必须拒绝：

- 缺少完整 `BEGIN` / `CHUNK` / `END`。
- `chunkCount` 与实际 chunk 数量不一致。
- chunk index 重复、越界或缺失。
- 解码后的 `byteLength` 不一致。
- SHA-256 不一致。
- 解码结果不是合法 JSON。
- schema 或多人公平检查失败，除非显式使用 `--allow-invalid` 做诊断。

诊断模式：

```bash
npm run bridge -- --input-log "<Lua.log>" --output-dir "<snapshot-dir>" --diagnose-only
```

常驻读取：

```bash
npm run bridge -- --input-log "<Lua.log>" --output-dir "<snapshot-dir>" --watch
```

缓存读取：

```bash
npm run tuner-bridge -- --output-dir "<snapshot-dir>" --state civ6_ai_copilot
```

## 5. 输出文件

写出目录：

```text
<snapshot-dir>/
├── latest.json
├── latest-manifest.json
└── <sessionId>/
    └── turn-0042-player-0-<exportId>.snapshot.json
```

写文件必须使用临时文件 + 原子 rename，避免 AI 或其他工具读到半写入 JSON。

`latest-manifest.json` 记录：

- `exportId`
- `snapshotPath`
- `checksumSha256`
- `transportChecksumSha256`
- `writtenAt`
- `modVersion`
- `compatVersion`

## 6. Snapshot 语义

正式 schema 位于 `schemas/snapshot.schema.json`。

顶层必须表达：

- `source.modId`
- `source.modVersion`
- `source.compatVersion`
- `source.protocolVersion`
- `source.visibilityMode: "player-visible"`
- `session.sessionId`
- `session.gameTurn`
- `localPlayer.localPlayerId`
- `modules`

事实对象尽量包含：

- `source`
- `visibility`
- `confidence`

选择性汇总未请求的模块可以保留空数组或空对象，但必须通过 `modules` 和低置信度表达不可用于强结论。

`visibleMap.scope = "player-visible-revealed"` 表示本地玩家已揭示/当前可见地图视野。`visibleMap.truncated = true` 时，AI 只能把已导出的 hex 当局部辅助材料。

`visibleMap.tiles[]` 可以包含地块规划字段：`terrainType`、`featureType`、`resourceType`、`resourceAmount`、`isFreshWater`、`isRiver`、`riverEdges`、`isHills`、`isMountain`、`isWater`、`isCoastalLand`、`isLake`、`isImpassable`、`cliffEdges`、`improvementType`、`routeType`、`districtType`、`continentType`、`appeal` 和 `yields`。这些字段用于坐城、区域、改良、移动和视野判断；缺失表示当前 API 未提供或当前玩家不可识别。

## 7. 多人公平规则

- 己方城市/单位可标记为 `own`。
- 他方单位只允许出现在当前可见地块，且标记 `visible-now`。
- 未探索地块不得进入 `visibleMap.tiles`。
- 外交只导出已遇见玩家的公开信息。
- 城市生产、政策、科技/市政和资源库存只导出本地玩家自己的数据。
- `terrainType`、`featureType`、`resourceType`、`improvementType`、`routeType`、`districtType`、`continentType` 使用稳定 GameInfo 标识，不使用运行时数字索引。

## 8. 版本兼容

当前版本由 `project-version.json` 提供：

- `version = 0.1.0`
- `compatVersion = 0.1`
- `protocolVersion = 0.1.0`
- `schemaVersion = 0.1.0`

`skill` 与 Mod 的 `compatVersion` 必须一致。Patch 版本不一致时可继续分析，但应提示更新。破坏性 schema 或协议变化必须同步更新 schema、fixtures、bridge/tuner tests、preflight/summary、skill references 和本文档。
