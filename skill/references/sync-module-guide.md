# 情报模块指南

Skill 应把当前情报覆盖状态翻译成玩家可执行的战情简报动作。

稳定按钮/模块名称：

- `turn` -> 「汇总本回合」
- `cities` -> 「城市运营」
- `units` -> 「军事态势」
- `techs` / `civics` -> 「科技市政」
- `government` / `policies` -> 「政体政策」
- `resources` -> 「资源库存」
- `diplomacyPublic` -> 「公开外交」
- `visibleMap` -> 「更新地图情报」
- `full` -> 「完整战情简报」

当前版本的按钮组合：

- 「汇总本回合」会刷新 `cities`, `units`, `techs`, `civics`, `government`, `policies`, `resources`, `diplomacyPublic`, `visibleMap`，适合首次使用、多个模块缺失、snapshot 过旧或状态不确定。
- 「更新地图情报」会刷新 `units`, `visibleMap`, `diplomacyPublic`。
- 「城市运营」会刷新 `cities`, `resources`。
- 「科技市政」会刷新 `cities`, `techs`, `civics`, `resources`。
- 「政体政策」会刷新 `government`, `policies`, `resources`。
- 「完整战情简报」用于版本变化、诊断异常或多个互不相关模块需要重建。

| 分析意图 | 必需模块 | 推荐提示 |
|---|---|---|
| 开战/防守/前线 | `cities`, `units`, `visibleMap`, `diplomacyPublic` | 点击「更新地图情报」；必要时再选择「城市运营」「军事态势」「公开外交」 |
| 海军/岛图/港口 | `cities`, `units`, `visibleMap`, `resources`, `techs` | 点击「更新地图情报」，再选择「军事态势」「资源库存」「科技市政」 |
| 侦察路线/单位移动 | `units`, `visibleMap` | 点击「更新地图情报」 |
| 逐城生产 | `cities`, `resources` | 选择「城市运营」「资源库存」 |
| 科技/市政/尤里卡/鼓舞 | `cities`, `techs`, `civics`, `resources` | 选择「城市运营」「科技市政」「资源库存」 |
| 政策卡/政体 | `government`, `policies`, `resources` | 选择「政体政策」「资源库存」 |
| 定居点/铺城 | `cities`, `units`, `visibleMap`, `resources` | 点击「更新地图情报」，再选择「城市运营」「军事态势」「资源库存」 |

若 snapshot 中 `modules` 不包含必需模块，先请求更新对应情报。若包含但 `confidence` 是 `low`，可以给低置信度建议，但要说明信息限制。

## 回复契约

当当前快照未覆盖必需模块时，不输出最终建议，先输出：

1. 当前限制：说清哪个模块会影响什么判断。
2. 战情简报动作：使用表中的中文按钮名和模块名。
3. 回传方式：让用户看到面板显示“简报已汇总，可继续由AI副官分析。”和“最近汇总：…”后，按当前意图重新运行标准入口，例如 `npm run copilot -- --intent turn-priority --clean`；跨设备由游戏机生成并同步 handoff 目录。

示例：

```text
当前快照未覆盖城市运营和资源库存，因此不能可靠给出逐城生产队列。请在 Civ6 打开战情简报，选择「城市运营」「资源库存」，待最新战情写入后再继续分析。
```

如果当前快照未覆盖 `visibleMap` 和 `units`，优先要求点击「更新地图情报」。如果三个以上互不相关模块都需要更新，要求点击「完整战情简报」，并说明它仍只应导出本地玩家理论可见信息。

如果没有 snapshot、snapshot 过旧或用户不确定是否成功同步，优先要求点击「汇总本回合」，因为它是当前版本最稳的通用刷新入口。

如果标准入口或 handoff 已给出 `recommendation` / `nextActions`，优先使用其中的战情简报动作。

`visible-map.svg` 只作为玩家可见 hex map 辅助材料；它帮助 AI 内部核对坐标、单位、城市和资源相对位置，但不是全图真相。输出给玩家时必须把坐标翻译成相对位置、屏幕方向和游戏可见锚点。未渲染区域不要解读为空地或已侦察安全区域。
