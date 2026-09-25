# 情报模块指南

Skill 应把当前情报覆盖状态翻译成玩家可执行的战情简报动作。动作说明遵循 `SKILL.md` 的当前对话语言策略；模块名供内部覆盖判断使用，玩家手动刷新时统一点击「更新战情」。

稳定模块 key 与当前简体中文界面标签：

- `full` -> 手动按钮「更新战情」
- `full` + `auto-turn` -> 自动全量刷新（无单独手动触发按钮）
- `turn` -> 内部轻量诊断路径，不作为玩家自动刷新流程
- `selection`, `cities`, `units`, `governors`, `trade`, `cityStates`, `techs`, `civics`, `government`, `policies`, `resources`, `diplomacyPublic`, `visibleMap`, `economy` -> 内部数据模块，无独立玩家按钮

「更新战情」与「每回合自动更新」都刷新所有当前已实现模块，并包含预算限制的可见地图；自动开关默认关闭。内部 `turn` 轻量路径只用于诊断。覆盖判断仍按意图要求的模块、`modules`、`moduleStatus` 回合和时间完成。`governors`、`trade`、`cityStates` 的 `availability` 为 `not-applicable` 时，该意图不因此受阻；`unavailable` 表示本次 API 未能提供数据，不能当成成功空结果。

| 分析意图 | 必需模块 | 推荐提示 |
|---|---|---|
| 开战/防守/前线 | `cities`, `units`, `visibleMap`, `diplomacyPublic` | 点击「更新战情」 |
| 海军/岛图/港口 | `cities`, `units`, `visibleMap`, `resources`, `techs`, `trade` | 点击「更新战情」 |
| 侦察路线/单位移动 | `units`, `visibleMap`, `selection` | 点击「更新战情」 |
| 逐城生产 | `cities`, `resources`, `selection` | 点击「更新战情」 |
| 科技/市政/尤里卡/鼓舞 | `cities`, `techs`, `civics`, `resources` | 点击「更新战情」 |
| 政策卡/政体/总督 | `government`, `policies`, `governors`, `selection` | 点击「更新战情」 |
| 商路容量/现有路线 | `trade`, `cities` | 点击「更新战情」 |
| 使者/城邦任务 | `cityStates` | 点击「更新战情」 |
| 定居点/铺城 | `cities`, `units`, `visibleMap`, `resources`, `selection` | 点击「更新战情」 |

若 snapshot 中 `modules` 不包含必需模块，先请求更新对应情报。若包含但 `confidence` 是 `low`，可以给低置信度建议，但要说明信息限制。

## 回复契约

当当前快照未覆盖必需模块时，不输出最终建议，先输出：

1. 当前限制：说清哪个模块会影响什么判断。
2. 战情简报动作：使用当前回答语言说明要更新的模块；需要精确点击时，引用表中的界面标签或玩家当前界面的对应本地化标签。
3. 回传方式：让用户看到面板显示“简报已汇总，可继续由AI副官分析。”和“最近汇总：…”后，重新运行 `node scripts/context.mjs`。跨设备只同步最新导出，Mac 侧仍读简报。

示例：

```text
当前快照未覆盖城市生产信息，因此不能可靠给出逐城生产建议。请在 Civ6 打开战情简报，点击「更新战情」，待最新战情写入后再继续分析。
```

如果当前快照未覆盖所需模块，一律要求点击「更新战情」，并说明缺失模块对判断的影响。该按钮只导出本地玩家理论可见信息。

如果当前回合的完整自动更新已成功且满足模块新鲜度要求，可直接分析；没有最新 snapshot、采集失败或用户不确定是否成功时，要求点击「更新战情」。

如果标准入口或 handoff 已给出 `recommendation` / `nextActions`，优先使用其中的战情简报动作。

`visible-map.svg` 只作为玩家可见 hex map 辅助材料；它帮助 AI 内部核对坐标、单位、城市和资源相对位置，但不是全图真相。输出给玩家时必须把坐标翻译成相对位置、屏幕方向和游戏可见锚点。未渲染区域不要解读为空地或已侦察安全区域。
