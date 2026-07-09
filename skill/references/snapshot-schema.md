# Snapshot Schema 摘要

正式 JSON Schema 位于 `schemas/snapshot.schema.json`。

## 顶层字段

- `schemaVersion`
- `exportedAt`
- `source.modVersion`
- `source.compatVersion`
- `source.visibilityMode`
- `session.sessionId`
- `session.gameTurn`
- `localPlayer.localPlayerId`
- `modules`
- `cities`
- `units`
- `visibleMap`
- `techs`
- `civics`
- `government`
- `resources`
- `diplomacy`
- `attention`
- `confidence`

每个事实对象尽量包含：

- `source`
- `visibility`
- `confidence`

选择性汇总未请求的模块也可能以空数组或空对象形式出现在顶层字段中。判断某个问题是否已覆盖，必须先看 `modules`，再看对象内的 `confidence`；不要仅因为顶层字段存在就当成可用事实。

`visibleMap.scope = "player-visible-revealed"` 表示地图视野扫描本地玩家已揭示/当前可见地块，不是当前屏幕窗口；若 `truncated = true`，不得把导出地图当完整视野。

回答时只把 `confidence: confirmed` 说成已确认；`inferred` 和 `low` 必须明确标注。

坐标字段用于 AI 对齐事实、渲染 SVG 和排障。面向玩家默认把坐标翻译成相对位置和可见锚点，例如“开拓者右侧一格”“勇士左上方”“首都南边沿河”“海岸湖湾右侧”“盐旁边的丘陵”“南边小岛”。单位移动优先读取摘要里的“单位相邻地块”；需要核对坐标方向时按 Civ6 屏幕方向处理：y 更大在上方，奇数 y 行相对偶数 y 行向右错半格。如果必须保留坐标，只能作为辅助说明。

`visibleMap.tiles[].resourceType` 只在本地玩家当前能识别该资源时出现，值应为 `RESOURCE_*` 标识。未出现时表示该地块没有可见资源，或资源对当前玩家仍未知；不要把未出现解读成完整地图事实。

`visibleMap.tiles[].terrainType` 和 `featureType` 如出现，应是 `TERRAIN_*` / `FEATURE_*` 稳定标识。未出现时只能说明该 Mod/API 未提供该字段，不能据此判断地形为空或无地貌。

地图规划优先读取 `visibleMap.tiles[]` 的以下字段：`isFreshWater`、`isRiver`、`riverEdges`、`isHills`、`isMountain`、`isWater`、`isCoastalLand`、`isLake`、`isImpassable`、`cliffEdges`、`improvementType`、`routeType`、`districtType`、`continentType`、`appeal`、`yields`。这些字段影响坐城淡水、过河移动、区域相邻、港口/商业/水渠/学院/圣地/工业区选址、国家公园和改良路线。字段缺失表示当前 API 未提供或当前玩家不可识别，不代表事实不存在。

给开局、铺城、区域和单位移动建议时，先核对单位所在和目标相邻地块：地形/地貌决定移动代价和视野收益，河流边与悬崖边影响通行和区域规划，淡水/海岸决定城市基础住房与港口节奏。能从 `movesRemaining` 与地块事实判断的行动，直接给明确回合安排，不要写“若还能行动/若还能建城”这类不确定话。

术语输出用文明 6 中文名，不把英文内部标识直接写给玩家。例：`TERRAIN_PLAINS_HILLS` 写“平原丘陵”，`FEATURE_JUNGLE` 写“雨林”，`coast/coastal` 写“海岸/沿海”，腓尼基 `Cothon` 写“U型港”或“特色港口”。

`cities[].currentProduction.type` 应是 `UNIT_*`、`BUILDING_*`、`DISTRICT_*`、`PROJECT_*` 或 `UNKNOWN_PRODUCTION`，`name` 应是本地化文本或未知占位。若看到纯数字，说明快照来自旧 Mod 或解析失败，先要求重新安装并重新汇总，不要把数字当成生产项目名称。`turnsUntilComplete` 只应是非负整数；如果生产刚完成且玩家尚未选择新生产，该字段可能不会出现，不能把 `-1` 当作“还差 -1 回合”。

## 当前可见信息

| 模块 | 可用事实 | 典型用途 |
|---|---|---|
| `source` / `session` | 导出 id、导出类型、回合、规则集、速度、是否多人 | 判断新鲜度、导出路径和多人提示 |
| `localPlayer` | 本地玩家 id、文明、领袖、玩家名 hash | 文明特性、玩家视角和隐私边界 |
| `modules` | 本次汇总覆盖模块 | 决定是否可回答，或需要选择哪个战情按钮 |
| `cities` | 自有/可见城市坐标、人口、生产、产出 | 逐城生产、区域、发展节奏 |
| `units` | 自有单位与当前可见外方单位位置、类型、伤害、移动力 | 逐单位、侦察、战争、防守 |
| `visibleMap` | 已揭示/当前可见 hex、地形、地貌、可见资源、单位/城市关联 | 定居、前线、海军、资源岛、战术地形 |
| `techs` / `civics` | 当前、已完成、可选、boosts | 科技/市政路线、尤里卡/鼓舞 |
| `government` | 当前政体、政策槽、已插政策、是否可换卡 | 政策卡与爆发回合 |
| `resources` | 本地资源库存 | 生产、升级、短缺、交易 |
| `diplomacy` | 已遇见玩家公开关系与公开军事分 | 外交风险、开战窗口 |
| `attention` | Mod/工具诊断和提示 | 判断是否需要先排障或更新情报 |

## AI 可分析视图

处理顺序：

1. 先把玩家请求转成稳定分析意图，再运行标准入口，例如 `npm run copilot -- --intent turn-priority --clean`，读取生成的 handoff。
2. 用 `modules` 判断当前分析意图是否覆盖。
3. 用 `copilot-summary.md` 获得中文事实摘要；地图、战争、海军、定居问题结合 `visible-map.svg`。
4. 回答只把 `confirmed` 且在已覆盖模块内的事实写成“已确认”；`low`、`inferred`、未覆盖字段、未渲染地图都写进信息限制或风险。
5. 关键模块未覆盖时，把信息限制翻译成战情简报动作，不要求用户笼统提供更多材料。
6. 输出位置建议时，用相对位置、屏幕方向和游戏可见锚点；坐标只用于内部核对或用户明确要求。

可支持的能力：开局坐城/铺城、逐城生产、科技/市政路线、政策/政体、战争/防守、海军/岛图、资源/交易、多人公开信息风险评估、Mod 与本地助手工具排障。

不可支持或必须降级：隐藏地图、不可见单位、未遇见文明、秘密外交、其他玩家私人科技/政策/城市队列、全图安全断言、替玩家自动执行游戏动作。

## Skill 质量维护

让 AI 困惑、使用不顺手、调用低效或稳定欠佳的 skill 表现都是质量缺陷。典型表现包括：按钮/模块名称不一致、信息不足时不给具体战情简报动作、忽略 `modules`/`confidence`/`visibility`、绕过标准入口去搜索旧 snapshot 或旧 handoff、默认要求完整战情简报、把未知地图或低置信度推断说成事实。

维护时先修 skill/reference/CLI 诊断文案；能稳定防回归的再加窄测试。不要为普通文案变化堆宽泛测试。
