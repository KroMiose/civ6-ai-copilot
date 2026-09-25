# 首批决策数据 API 核对

状态：静态核对已完成；真实游戏与双人多人实测待做。依据 D020 和本机 Civilization VI 原生 InGame UI 的读取路径，仅记录接口依据，不复制游戏代码或数据库内容。

| 模块 | 原生 UI 依据 | 本采集器读取范围 |
| --- | --- | --- |
| 总督 | `DLC/Expansion2/UI/Additions/GovernorPanel.lua`、`GovernorSupport.lua`、`GovernorDetailsPanel.lua` | 本地 `GetGovernors()` 的头衔计数、已任命总督、可任命状态；总督驻扎城市、就职与中和回合、已获晋升。按原生 `GovernorsCannotAssign` 规则跳过不可任命对象。 |
| 商路 | `Base/Assets/UI/TopPanel.lua`、`Screens/ReportScreen.lua` | 本地商路计数、容量，以及本地城市 `GetTrade():GetOutgoingRoutes()` 返回的现有路线。对路线目的地先确认是本地或已遇见对象；不采坐标、候选路线收益或路线期限。 |
| 城邦使者 | `Base/Assets/UI/TopPanel.lua`、`PartialScreens/CityStates.lua` | 本地可用使者、已遇见且可接收影响力的城邦、本地使者数、是否由本地玩家担任宗主、原生任务管理器给本地玩家的任务与奖励，以及按城邦类型显示的公开奖励说明。读取城邦状态前先通过本地 `HasMet` 检查。 |

总督和商路接口只调用原生 UI 使用的只读 getter。城邦采集不会调用整段面板刷新/确认逻辑；特别是不调用 `SetTitleConsidered` 或 `SetGivingTokensConsidered`。宗主信息只导出本地玩家的布尔状态，不导出其他玩家 ID、使者数或资源库存。公开宗主奖励不包含原生奖励提示中可能出现的当前宗主库存资源。

采集结果在 API 明确返回规则能力关闭时标为 `not-applicable`；关键接口不可用时标为 `unavailable`；可用字段部分成功时保留已确认字段、把 `confidence` 降为 `low`，并省略失败字段。成功读到的零和空列表保留为 `0`、`[]`。无法完整确认已遇见城邦集合时省略列表，避免把读取失败表达为空集合。

仍需在实际游戏中验证 Gathering Storm/规则集差异、UI Lua API 返回值、双人多人各自导出边界以及 Windows 与 Aspyr 环境的 Mod 加载。测试 fixture 使用合成玩家与合成 API，不包含实际存档、日志或采集快照。
