# AI 可分析视图

本文定义 AI 如何使用 `civ6-ai-copilot` snapshot，并约束回答中的事实来源、信息限制和玩家可执行表达。

## 1. 输入链路

标准入口：

1. AI 先把玩家请求转成稳定分析意图，再运行 `npm run copilot -- --intent <intent> --clean`。
2. 工具刷新当前战情，完成 schema、公平性、manifest、新鲜度、模块覆盖和兼容性检查。
3. 工具生成 handoff 目录，包含 `codex-prompt.md`、`copilot-handoff.md`、`copilot-summary.md`、`latest.json`、`latest-manifest.json` 和可选 `visible-map.svg`。
4. skill 读取 `codex-prompt.md` 中列出的文件，先说明已确认信息，再给建议、风险和信息限制。

常用命令：

```bash
npm run copilot -- --intent war --clean
```

底层的 `validate`、`preflight`、`summarize`、`render-map`、`handoff` 和 `suggest-sync` 用于排障、测试和发布验证。

## 2. 可用事实

AI 判断事实可用性时先看 `modules` 与 `moduleStatus`：必须是当前回合且通过逐模块时间检查，再看对象内的 `confidence`、`visibility` 和 `source`。同回合不同专题保留各自时间，不声称是原子快照；过期模块不进入摘要或地图。

TypeScript 摘要先按确定性优先级挑选行动重点，再交给 AI 判断。普通回合无需地图；地图采样和规划字段缺失不能推断为安全或空地。

| 模块 | 典型用途 | 关键边界 |
|---|---|---|
| `session` / `source` | 回合、规则集、导出路径、版本 | 不代表内容完整 |
| `localPlayer` | 文明、领袖、本地玩家视角 | 不导出玩家名或伪名字 hash |
| `selection` | 当前选中的己方城市和单位 | 未选择、API 不支持与读取失败必须分开 |
| `cities` | 逐城生产、区域/建筑、粮食、住房和围城状态 | 只导出本地玩家城市运营信息 |
| `units` | 己方单位射程、移动上限、建造次数、经验、晋升和升级费用 | 这些字段只用于本地玩家单位；升级费用不代表当前可升级 |
| `governors` | 可用头衔、总督任命/驻扎/就职状态与晋升 | 使用 `availability` 区分适用、可用和采集失败 |
| `trade` | 商路容量、已用路线、涉及己方的路线信息 | 不导出目的玩家身份或隐藏目的地信息 |
| `cityStates` | 已遇见城邦的己方使者、可见任务与公开宗主奖励 | 不枚举未遇见城邦或其他玩家私人使者 |
| `units` | 逐单位、侦察、战争、防守 | 他方单位必须当前可见 |
| `visibleMap` | 定居、前线、海军、资源岛、区域选址、移动规划 | 地形/地貌/河流/淡水/悬崖等字段缺失不等于事实不存在 |
| `techs` / `civics` | 尤里卡、鼓舞、路线规划 | 低置信度时不能给确定路线 |
| `government` / `policies` | 换卡、槽位、爆发回合 | 不导出其他玩家政策 |
| `economy` | 买造、升级、维护、经济承受力 | 只读己方；净金币与收入、维护分别表达 |
| `resources` | 生产、升级、短缺、交易 | 库存资源与地图资源语义不同 |
| `diplomacy` | 已遇见文明公开关系和公开分数 | 不包含秘密外交或未遇见玩家 |
| `attention` | 诊断、信息限制、风险提示 | 不能替代模块事实 |

## 3. 回答契约

数据足够时，回答包含：

- 我已确认的信息
- 本回合优先级
- 具体操作建议
- 风险和备选
- 信息限制

信息不足时，先输出情报更新动作，不输出最终建议：

```text
判断前需要前线可见地块和单位位置。请打开战情简报，点击「更新战情」，面板显示“简报已汇总，可继续由AI副官分析。”后重新运行标准入口。
```

多人局、战争迷雾或信息限制影响结论时，用一句话说明可见信息边界。单人局且数据充足时，回答应直接进入游戏判断。

## 4. 位置表达

坐标用于内部核对、SVG 元数据和排障。面向玩家的建议默认使用相对位置和可见锚点：

- 开拓者右侧一格的咖啡
- 勇士左上方的盐
- 首都南边沿河丘陵
- 沿海湖湾右侧
- 南边小岛

只有用户明确要求坐标或正在排障时，坐标才作为辅助说明。

## 5. 地图规划事实

开局、铺城、区域和单位移动建议必须优先核对 `latest.json` 的 `units` 与 `visibleMap.tiles`。关键字段包括 `terrainType`、`featureType`、`resourceType`、`isFreshWater`、`isRiver`、`riverEdges`、`isHills`、`isMountain`、`isWater`、`isCoastalLand`、`isLake`、`isImpassable`、`cliffEdges`、`improvementType`、`routeType`、`districtType`、`continentType`、`appeal` 和 `yields`。

这些字段影响移动代价、视野收益、城市淡水/海岸住房、港口/商业/水渠/学院/圣地/工业区选址、国家公园、改良优先级和道路节奏。能从单位移动力和地块事实判断的行动，直接给明确安排，不写“若还能行动/若还能建城”。

## 6. 支持能力

在模块覆盖且校验通过时，可以支持：

- 开局坐城与铺城
- 逐城生产和区域规划
- 科技/市政与尤里卡/鼓舞路线
- 政体/政策卡建议
- 军事、防守、前线和可见威胁分析
- 海军、岛图、港口和海上资源节奏
- 资源短缺、升级和交易判断
- 多人公开信息风险评估
- Mod 与本地助手工具排障

必须降级或拒绝：

- 全图安全判断
- 隐藏战略资源判断
- 不可见单位位置判断
- 未遇见玩家状态
- 秘密外交
- 其他玩家私人科技、政策、资源和城市队列
- 自动替玩家执行游戏操作

## 7. Skill 质量

Skill 质量是产品质量。让 AI 使用不顺手、调用低效、稳定性欠佳，或忽略 `modules`、`visibility`、`confidence`、manifest、freshness、fairness 的行为，都属于质量缺陷。

典型缺陷：

- UI、docs、skill 中按钮名或模块名不一致。
- 信息不足时只要求“更多信息”，没有给 战情简报动作。
- 能用 handoff/preflight/summarize/render-map，却要求直接读取大 JSON 或反复要求截屏。
- 地图问题没有使用玩家可见 hex map。
- 面向玩家输出裸坐标而没有相对位置。
- Agent 绕过标准入口，手工搜索旧 snapshot 或旧 handoff。
- 指导玩家点击不存在的专题按钮，而不是统一使用「更新战情」。
- 把未知、低置信度或未渲染地图说成事实。

维护时优先修 skill reference、preflight、suggest-sync、handoff 或 doctor 文案；能稳定防回归的行为再加入窄测试。
