# Snapshot 协议 0.3

本协议用于被动 UI Mod 到 bridge / tuner-bridge 的本地玩家可见情报传输。Mod 不执行游戏操作；Windows 读取 Lua.log，macOS/Aspyr 读取 ExposedMembers.Civ6AICopilot.latestExport 中已完成的分块。

## 分块与完整性

每次导出按 BEGIN / CHUNK / END 输出，sentinel 后为 JSON：

```text
CIV6_AI_COPILOT_SNAPSHOT_BEGIN {"protocolVersion":"0.3.0","schemaVersion":"0.3.0","exportId":"example-export","chunkCount":2,"byteLength":900,"encoding":"base64-json"}
CIV6_AI_COPILOT_SNAPSHOT_CHUNK {"exportId":"example-export","index":0,"data":"..."}
CIV6_AI_COPILOT_SNAPSHOT_CHUNK {"exportId":"example-export","index":1,"data":"..."}
CIV6_AI_COPILOT_SNAPSHOT_END {"exportId":"example-export"}
```

这是形状示意，data 需替换为真实 Base64。BEGIN 可带 createdAt。

0.2 正式删除发送方 SHA-256、hash phase、transportChecksumSha256，以及无隐私用途的 localPlayerNameHash；没有跳过哈希哨兵或旧协议兼容分支。

bridge 拒绝：版本不匹配、不完整 BEGIN/END、exportId 不匹配、非整数或非法 chunkCount/index/byteLength、缺失/重复/越界 chunk、无效 Base64、解码长度不匹配、无效 UTF-8/JSON、schema 或 fairness 失败。diagnose-only 只诊断；allow-invalid 仅用于开发诊断，不使数据获得可分析资格。结构检查不提供密码学认证，也不能识别仍形成合法 JSON 的所有内容篡改；链路用途是本机 UI 导出，不是对抗性网络协议。

完成诊断保留 reason=exported、exportId、chunkCount、byteLength、emittedAt，不含 transport checksum。日志输出每帧最多 64 chunks，Base64 按块生成；地图另行分帧。BEGIN 仅在采集和编码完成后输出。

## 模块刷新契约

顶层 `modules` 记录本回合已尝试并写入快照的模块；`moduleStatus` 为每个采集过的模块保存：

```json
{"cities":{"capturedTurn":42,"capturedAt":"2026-09-25T08:00:00Z","exportId":"example-cities"}}
```

- Mod 在同一载入会话、本地玩家、回合内累积模块，专题刷新整模块替换，包括合法的空数组；绝不逐个实体做深层 JSON merge。
- tuner 缓存的最后一次导出也带累计模块，所以连续点地图、城市、资源后只读取一次仍能获得全部本回合专题。
- 游戏内导出在写入缓存前已经完成本次回合的模块累积。桌面 writer 把这份完成的导出整份写成 `latest.json`，不与上一份磁盘快照合并，也不因为回合变小而拒绝。回档后的新汇总因此成为当前战情。
- 历史文件仍按 session 和 exportId 保留，但不是当前指针。旧单位位置不会从上一份 `latest.json` 并进这次导出。
- government/policies 共用 government payload，两者必须一起刷新且采集记录相同。
- meta/localPlayer 每次更新；source.exportId 和 exportedAt 标识本次导出，不代表所有模块同时采集。
- modules 声明的模块必须有与 session.gameTurn 相同的 capturedTurn；schema 校验后还检查这些关系。
- 同回合多人也可能继续行动：每模块 capturedAt/exportId 必须保留，不能称为原子世界快照。长地图采集若跨回合或换本地玩家会中止，要求重新刷新。
- 未请求模块可能有 schema 的空占位，不能从字段存在推断可用。preflight 对意图要求的每个模块单独检查采集时间（默认 30 分钟），刷新资源不能使旧城市重新变新。
- notifications 没有真实 collector，已从可声明的模块中移除；attention 是诊断，不是假冒游戏通知。
- `selection` 每次刷新都重新采集，己方城市/单位状态与 null id 一起保留；旧选择不能沿用为本次状态。
- `governors`、`trade`、`cityStates` payload 根记录 `availability`：`available` 表示已采到的可用数据，`not-applicable` 表示当前规则不适用，`unavailable` 表示读取失败或 API 不可用。后两者不能伪装成空数组或零值；`not-applicable` 不阻塞意图预检，`unavailable` 不能被当作成功空结果。
- 手动按钮「更新战情」与「每回合自动更新」采集范围相同：全部已实现模块和受预算限制的可见地图。自动开关默认关闭；自动导出使用 `exportType=full` 与 `triggerKind=auto-turn`。内部 `syncTurn` 轻量路径只供诊断，不是玩家自动更新路径。

## 地图与公平边界

visibleMap.scope 为 player-visible-revealed。1024 个地块上限保留；选择优先考虑当前视野与己方单位/城市附近，详细 Plot getter 仅对入选且当前可见地块执行，bounds 依据实际导出地块。truncated=true 表示采样不完整，不能作全图安全结论。

本协议的迷雾策略保守：revealed=true 且 visibleNow=false 只输出坐标和元数据，不从当前 Plot 读取地形、地貌、所有权、改良、路线、区域、资源、吸引力、产出或通行状态。地形/地貌也可能因灾害、砍树或玩法变化而改变；未来若加入历史记忆，必须存储真实观测时间，不能拿当前 getter 冒充历史记忆。

当前可见资源只有在本地玩家 IsResourceVisible 成功时才有 resourceType，同时才允许 resourceAmount。单位另用玩家视角的 IsUnitVisible 检查，不能由地块可见推断隐身单位可见。外方单位不含私人行动力、经验、晋升等字段；城市运营、研究、政策、经济、库存仅采本地玩家，外交仅已遇见文明公开信息。

## 输出与历史

```text
<snapshot-dir>/latest.json
<snapshot-dir>/latest-manifest.json
<snapshot-dir>/<sessionId>/turn-0042-player-0-<exportId>.snapshot.json
```

文件通过临时文件 + rename 写入；manifest 的 checksumSha256 是最终 latest.json 的文件内容指纹，checksumScope=latest-json-file，仅用于本地读写一致性检查。它不是发送端校验，也不记录 transport hash。manifest 同时保留 exportId、snapshotPath、latestPath、writtenAt。

sessionId 不再随回合变化。当前 session.idScope=load 明示仅保证一次 UI 载入期间稳定，不声称它是跨读档的游戏唯一 ID；每个 exportId 独立，模块保存自己的时间和导出来源。重新载入隔离缓存，避免不同游戏误合并。跨读档 gameId 和趋势分析需取得稳定且不会泄露随机种子的 API 后再实现。

## 迁移与命令

version/schemaVersion/protocolVersion=0.3.0，compatVersion=0.3。0.2 快照不能直接合并到 0.3；升级 Mod 和本地工具后重新汇总。旧历史可离线保留，但不能冒充 0.3 数据。Mod 仍为 AffectsSavedGames=0。

```bash
npm run bridge -- --input-log "<Lua.log>" --output-dir "<snapshot-dir>" --watch
npm run tuner-bridge -- --output-dir "<snapshot-dir>" --state civ6_ai_copilot
npm run copilot -- --intent war --clean
```
