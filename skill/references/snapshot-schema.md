# Snapshot Schema 摘要

正式 JSON Schema 位于 `schemas/snapshot.schema.json`。

可选决策字段：城市可包含 `buildings`、`districts`（区域条目的 `isBuilt` 可能缺失）、人口限制区域计数、生产进度/成本、粮食库存/盈余/增长门槛与 `underSiege`。己方单位可包含 `range`、`maxMoves`、`buildCharges`、经验、等级、晋升、编队类型和升级费用；这些读数不代表行动许可或对具体目标的完整战斗修正。科技/市政 `currentProgress` / `currentCost` 表示当前项目进度/成本。`government.availablePolicies` 是当前已解锁且未过时的卡，提供 `type`、可用的本地化 `name` / `description` 和 `slotType`；不等于当前允许免费换卡。

`economy` 是独立己方模块，提供可用的 `goldBalance`、`goldIncomePerTurn`、`goldMaintenancePerTurn`、`goldPerTurn`、`faithBalance`、`faithPerTurn`、`sciencePerTurn`、`culturePerTurn`。字段缺失表示 API 未提供，不代表零。`selection` 每次刷新都会记录己方城市/单位的 `selected`、`none`、`unsupported` 或 `error` 状态；非 `selected` 状态的 id 必须为 `null`。`governors`、`trade`、`cityStates` 在根对象记录 `availability`：`available` 为可用数据，`not-applicable` 为当前规则不适用，`unavailable` 为采集/API 失败；后两者不能当作成功的空列表，且 `not-applicable` 不阻塞预检。

0.3 中 `moduleStatus[module]` 包含 `capturedTurn`、`capturedAt`、`exportId`。模块须出现在 `modules` 且采集回合等于 `session.gameTurn`，再通过逐模块时间和置信度检查。旧回合记录只是过期提示；最新导出时间不会刷新未采模块。同回合各次刷新仍按模块单独替换。

迷雾地块本轮只保留已探索坐标，不包含当前 Plot 的实时状态；缺失地形、资源、所有权等不得推断为不存在。`resourceAmount` 必须伴随已识别的 `resourceType`。`session.idScope=load` 表示 sessionId 只在本次载入内稳定，不得跨载入做单位损失趋势。

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
- `moduleStatus`
- `selection`
- `session.idScope`
- `economy`
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
- `governors`
- `trade`
- `cityStates`

每个事实对象尽量包含：

- `source`
- `visibility`
- `confidence`

未请求的 `governors`、`trade`、`cityStates` 可带 `availability: unavailable` 的低置信度占位对象，但不会出现在 `modules`；判断覆盖必须先检查模块列表、`moduleStatus` 当前回合与模块置信度，再检查 `availability`。不要仅因为顶层字段存在或数组为空就当成可用事实。

`visibleMap.scope = "player-visible-revealed"` 表示地图视野扫描本地玩家已揭示/当前可见地块，不是当前屏幕窗口；若 `truncated = true`，不得把导出地图当完整视野。

回答时只把 `confidence: confirmed` 说成已确认；`inferred` 和 `low` 必须明确标注。

坐标字段用于 AI 对齐事实、渲染 SVG 和排障。面向玩家默认把坐标翻译成相对位置和可见锚点，例如“开拓者右侧一格”“勇士左上方”“首都南边沿河”“海岸湖湾右侧”“盐旁边的丘陵”“南边小岛”。单位移动优先读取摘要里的“单位相邻地块”；需要核对坐标方向时按 Civ6 屏幕方向处理：y 更大在上方，奇数 y 行相对偶数 y 行向右错半格。如果必须保留坐标，只能作为辅助说明。

`visibleMap.tiles[].resourceType` 只在本地玩家当前能识别该资源时出现，值应为 `RESOURCE_*` 标识。未出现时表示该地块没有可见资源，或资源对当前玩家仍未知；不要把未出现解读成完整地图事实。

`visibleMap.tiles[].terrainType` 和 `featureType` 如出现，应是 `TERRAIN_*` / `FEATURE_*` 稳定标识。未出现时只能说明该 Mod/API 未提供该字段，不能据此判断地形为空或无地貌。

地图规划优先读取 `visibleMap.tiles[]` 的以下字段：`isFreshWater`、`isRiver`、`riverEdges`、`isHills`、`isMountain`、`isWater`、`isCoastalLand`、`isLake`、`isImpassable`、`cliffEdges`、`improvementType`、`routeType`、`districtType`、`continentType`、`appeal`、`yields`。这些字段影响坐城淡水、过河移动、区域相邻、港口/商业/水渠/学院/圣地/工业区选址、国家公园和改良路线。字段缺失表示当前 API 未提供或当前玩家不可识别，不代表事实不存在。

给开局、铺城、区域和单位移动建议时，先核对单位所在和目标相邻地块：地形/地貌决定移动代价和视野收益，河流边与悬崖边影响通行和区域规划，淡水/海岸决定城市基础住房与港口节奏。`movesRemaining` 只表示剩余移动力，不能单独证明攻击、建城或建造许可；可确认的行动给具体安排，缺失限制明确说明。

术语输出使用当前回答语言对应的 Civilization VI 本地化名称，不把英文内部标识直接写给玩家。中文回答例：`TERRAIN_PLAINS_HILLS` 写“平原丘陵”，`FEATURE_JUNGLE` 写“雨林”，`coast/coastal` 写“海岸/沿海”，腓尼基 `Cothon` 写“U型港”或“特色港口”。英文回答使用 Civ6 英文术语，例如“plains hills”、“rainforest”、“coast/coastal”和“Cothon”。

`cities[].currentProduction.type` 应是 `UNIT_*`、`BUILDING_*`、`DISTRICT_*`、`PROJECT_*` 、`NO_PRODUCTION` 或 `UNKNOWN_PRODUCTION`，`name` 应是本地化文本或未知占位。若看到纯数字，说明快照来自旧 Mod 或解析失败，先要求重新安装并重新汇总，不要把数字当成生产项目名称。`turnsUntilComplete` 只应是非负整数；如果生产刚完成且玩家尚未选择新生产，该字段可能不会出现，不能把 `-1` 当作“还差 -1 回合”。

## 当前可见信息

| 模块 | 可用事实 | 典型用途 |
|---|---|---|
| `source` / `session` | 导出 id、导出类型、回合、规则集、速度、是否多人 | 判断新鲜度、导出路径和多人提示 |
| `localPlayer` | 本地玩家 id、文明、领袖（不采玩家名） | 文明特性、玩家视角和隐私边界 |
| `selection` | 当前选中的己方城市/单位状态；非己方选择不暴露对象 id | 将建议关联到玩家当前查看对象 |
| `modules` | 本次汇总覆盖模块 | 决定是否可回答，或需要选择哪个战情按钮 |
| `cities` | 自有城市坐标、人口、生产、建筑/区域、粮食与围城事实 | 逐城生产、区域、发展节奏 |
| `units` | 自有单位的行动/经验细节，以及当前可见外方单位位置、类型和伤害 | 逐单位、侦察、战争、防守；外方单位继续拒绝私人字段 |
| `governors` | 头衔、任命/派驻/就职状态与晋升 | 政策和城市规划；不能将不可用解释为空 |
| `trade` | 商路容量、活动数量、可见路线端点与剩余回合 | 商路规划；目的地仅在本方或已遇见信息允许时读取 |
| `cityStates` | 可用使者、已遇见城邦使者/宗主状态/奖励/任务 | 使者分配和任务优先级；不采未遇见详情或他方使者 |
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
3. 用 `copilot-summary.md` 获得事实摘要；地图、战争、海军、定居问题结合 `visible-map.svg`。若摘要语言与当前回答语言不同，只把它作为事实来源，不把两种语言混写给玩家。
4. 回答只把 `confirmed` 且在已覆盖模块内的事实写成“已确认”；`low`、`inferred`、未覆盖字段、未渲染地图都写进信息限制或风险。
5. 关键模块未覆盖时，把信息限制翻译成战情简报动作，不要求用户笼统提供更多材料。
6. 输出位置建议时，用相对位置、屏幕方向和游戏可见锚点；坐标只用于内部核对或用户明确要求。

可支持的能力：开局坐城/铺城、逐城生产、科技/市政路线、政策/政体、战争/防守、海军/岛图、资源/交易、多人公开信息风险评估、Mod 与本地助手工具排障。

不可支持或必须降级：隐藏地图、不可见单位、未遇见文明、秘密外交、其他玩家私人科技/政策/城市队列、全图安全断言、替玩家自动执行游戏动作。

## Skill 质量维护

让 AI 困惑、使用不顺手、调用低效或稳定欠佳的 skill 表现都是质量缺陷。典型表现包括：按钮/模块名称不一致、信息不足时不给具体战情简报动作、忽略 `modules`/`confidence`/`visibility`、绕过标准入口去搜索旧 snapshot 或旧 handoff、默认要求完整战情简报、把未知地图或低置信度推断说成事实。

维护时先修 skill/reference/CLI 诊断文案；能稳定防回归的再加窄测试。不要为普通文案变化堆宽泛测试。
