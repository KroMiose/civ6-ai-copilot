# 0.2 数据与多人公平审计

本轮在当前 main 基础上实现并离线验证，不包含真实 Civ6 对局或两名人类玩家的测试结论。Mod 保持被动 UI exporter，`AffectsSavedGames=0`；不写存档、规则、游戏状态或网络同步状态。

## 原生 UI 调用依据

只读核对本机安装的 `Base/Assets/UI/` 下文件；以下记录接口和用途，不打包 Firaxis 源码或数据库。API 存在不等于所有平台、DLC、第三方 Mod 都支持，运行时读取失败时省略可选字段。

| 新增/修正字段 | 原生 UI 依据 | 本轮处理 |
| --- | --- | --- |
| 城市六维产出 | `CitySupport.lua` 的城市产出采集，`city:GetYield` | 只读取己方城市，用运行时 `GameInfo.Yields` 标识 |
| 住房、宜居度、需求 | `CitySupport.lua` 的 `GetHousing/GetAmenities/GetAmenitiesNeeded` | 数字可用时导出，余量由 summary 计算 |
| 增长/饥荒回合 | `CitySupport.lua` 的 `GetTurnsUntilGrowth/GetTurnsUntilStarvation` | -1 不作为回合数导出；饥荒进入高优先级摘要 |
| 无生产/生产类型 | `CitySupport.lua` 的 `GetProductionInfoOfCity` | hash=0 为无生产；支持带符号 hash 查运行时 identifier；未知不当成空队列 |
| 己方基础战斗力 | `Panels/UnitPanel.lua` 的 `GetCombat/GetRangedCombat/GetBombardCombat` | 仅己方；不是对具体目标的最终战斗预测 |
| 外方单位可见性 | `WorldInput.lua` 的 `playerVisibility:IsUnitVisible(unit)` | 地块可见后还需单位可见；缺 API 时不导出外方单位，标记 own-only/low |
| 研究进度/成本 | `Screens/TechTree.lua`、`Screens/CivicsTree.lua` | 己方当前项目 progress/cost；不猜剩余回合或 boost 条件 |
| 可选政策 | `Screens/GovernmentScreen.lua` 的 `IsPolicyUnlocked/IsPolicyObsolete` | 使用 policy Hash；已解锁且未过时，附运行时本地化描述；读取不完整则省略 availablePolicies 并诊断 |
| 政策切换许可 | `GovernmentScreen.lua` 同时处理免费、付费和回合权限 | 不再用 CanChangeGovernment 代替换卡权限；未知时省略 canChangePolicies |
| 经济 | `TopPanel.lua` 的 treasury/techs/culture/religion getters | 己方金币、收入、维护、净 GPT、信仰、科技/文化产出；净 GPT=收入-维护；缺值不当零 |

## 地图 getter 审计

所有详细 getter 只对入选且读取时仍然可见的地块调用。扫描阶段只问本地玩家 `IsRevealed/IsVisible`；未探索坐标从不生成 tile，也不读取 Plot。细采前再次确认可见性。

| 信息 | 迷雾风险与处理 |
| --- | --- |
| owner / improvement / route / district | 可在迷雾中改变；不读取、不输出 |
| resourceType / resourceAmount | 可见地块仍需 `IsResourceVisible(resourceHash)`；类型未知时不调用 GetResourceCount，不输出数量 |
| appeal / yields | 受邻接、改良等实时状态影响；不读取迷雾值。可见 Plot 的 GetYield 调用依据为原生 `ToolTips/PlotToolTip.lua`，不是完整区域收益或城市收入 |
| terrain / feature / hills / mountain / water / lake / impassable / natural wonder | 部分受灾害、融冰或 Mod 改动影响；没有可靠历史缓存，因此一并禁止从迷雾当前对象读取 |
| river / cliff / continent / coastal / freshwater | 通常稳定，但本轮不建立未经时间标注的地图记忆；迷雾中仅保留已探索坐标和可见性元数据 |
| unitIds / foreign units | 只导出当前可见地块上且 IsUnitVisible 为真的单位；外方无行动力、经验、晋升等私人数据 |

未遇见文明不采集外交；其他玩家城市运营、政策、研究、经济、资源库存不采集。fairness 校验拒绝迷雾动态字段、隐藏资源数量侧信道、外方私人单位字段及 unrevealed tile。校验器只能验证协议声明和结构，游戏 API 的实际可见性仍需多人实测。

## 缓存、时间与采样限制

同回合专题按模块替换并保留各自采集时间；空数组也替换旧模块。跨回合丢弃旧模块数据，仅保存旧采集记录供过期提示。长任务跨回合/换玩家中止。玩家同回合内可移动单位，模块合并不是原子世界快照，战术分析前应最后刷新地图。

地图维持 1024 上限：当前可见（其中优先己方单位/城市附近）、附近迷雾、其余历史坐标。Huge 合成测试为 130×80，远端可见前线优先进入结果，详细 Plot getter 仅访问 12 个可见入选地块。该结果是调用计数测试，不是游戏帧率基准。1024 个以上同时可见地块仍会截断；不能由缺少外方单位推断无人。近邻预筛使用坐标方框，环绕边界和按意图区分 profile 待后续实现。

普通/自动回合不新采地图。如果本回合已经手动采过地图，累计快照仍可携带该地图（保持其原采集时间），所以自动汇总不承诺固定 wire 大小。资源 handle 每个地图 collector 获取一次，yield 描述列表缓存，SHA/hash phase 完全移除，输出每帧 64 chunks。

## 待实机验证与下一阶段

1. Windows 与 Aspyr：启用 Mod，reload UI，确认仅一个可见按钮/图钉；按地图→城市→资源同步，核对采集记录和累计 payload，再跨回合确认旧模块不进入分析。
2. 两名人类同局：分别对照 UI 的己方数据，移动敌军进出视野（含隐身单位）、迷雾内改良/归属变化、未解锁战略资源，确认两份导出互不泄露。
3. Huge 地图：采样覆盖、64 chunks/frame 对帧率/声音/日志的影响；采集过程中结束回合必须中止；JSON 编码仍为单帧，后续根据实测决定是否分帧。
4. 核对不同规则集的城市增长/饥荒、基础战斗力、已解锁/过时政策、成本、净 GPT 与 UI；政策 API 缺失须出现 available-policies-unavailable 诊断。
5. 后续独立增量：生产进度/队列、区域/建筑/容量/城防；单位射程、XP/晋升/行动限制；研究剩余回合、贸易路线与战略资源变化。每项先取得原生 UI 调用依据再扩展 contract。
6. 按 war/exploration/settling/navy/district-planning 区分采样与字段 profile；增加真实历史观测缓存，再评估 tile 公共元数据上移。本轮保留现有 tile wire 以避免混入第二轮大迁移。
7. session.idScope=load 仅在本次 UI 加载期间稳定，重载后另开历史目录。跨读档稳定 gameId 尚未实现；不得使用随机种子或仅 playerId+turn 代替。
8. 自动汇总偏好仍为 runtime。候选方式是 UI 本地 user-data store；需证明不进存档、不联网同步，并测试 Windows/Aspyr 与不同 profile 后才能启用，默认仍关闭。

## Issue #2 整合

与原 patch 一致：隐藏实际 CopilotButton/CopilotPin 控件、采用 64 chunks/frame。
调整：正式删除 SHA 传输字段与整套 Lua SHA/bit fallback，未采用 skipped-nohash；资源 handle 缓存在 collector 内而非 Lua 文件全生命周期。额外修复模块刷新语义、可见性、公平校验及轻量回合路径。

## 本轮离线验证（2026-09-25）

- `npm run typecheck`、`npm test`、`npm run mod:validate`、`npm run skill:validate`、`npm run privacy:check`、`npm run verify` 全部通过。
- 175 项自动测试通过，包括 6 项使用 Fengari 执行实际 Mod Lua 的合成 UI 行为测试。覆盖 130×80 地图采样、迷雾零 Plot 读取、隐藏资源数量、不可见单位、缺失 API、专题累积/过期、跨回合中止、LaunchBar reload 去重以及真实 Lua 输出经 bridge/schema 校验。
- 传输回归覆盖丢块、重复/越界索引、END 错序、byteLength、Base64、UTF-8、JSON 和 payload/BEGIN 身份版本不一致。摘要反转原始数组后保持同样结果。
- `npm audit` 为 0 漏洞；`git diff --check` 通过。本机 Mod 已安装并与源码逐文件比对一致，旧版本已本地备份。未 push、merge 或发布。
- 实机对局、两名人类多人公平测试及 Aspyr 验证尚未执行；以上离线通过不代表这些手工发布门槛已通过。
