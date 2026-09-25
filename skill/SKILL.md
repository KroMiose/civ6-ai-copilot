---
name: civ6-ai-copilot
description: 读取 Civilization VI civ6-ai-copilot Mod 最后一次成功汇总的本地玩家可见战情。按清单选择模块，为发展、城市、科技、市政、政策、军事、海军、定居和多人公平问题提供建议。
version: 0.3.3
compatVersion: "0.3"
---

# civ6-ai-copilot

## 怎么使用

玩家点击「更新战情」并看到「简报已汇总」后，当前对局就是这一次导出。从本 Skill 目录调用，不要找仓库、不要选工作目录，也不要搜索历史 snapshot 或 handoff。

不传 `--module` 时，返回这次导出里已经采到的全部模块：

```bash
node scripts/context.mjs
```

问题明确时，按下面的清单自己组装。`--query` 只是把用户原话带进结果，不决定读什么。

```bash
node scripts/context.mjs \
  --module cities --module units --module resources \
  --map local:unit:开拓者:5
```

## 能读取的项目

| 参数 | 内容 |
| --- | --- |
| `meta` | 回合、规则、速度、地图大小、是否多人 |
| `localPlayer` | 本地领袖、文明、玩家编号 |
| `selection` | 当前选中的城市或单位 |
| `cities` | 己方城市、产出、粮食、区域与建筑 |
| `units` | 己方单位，以及当前可见的外方单位 |
| `visibleMap` | 玩家可见地块：地形、地貌、资源、淡水、河流、丘陵、道路、区域、吸引力、产出 |
| `resources` | 己方资源库存 |
| `techs` | 科技进度和可研项目 |
| `civics` | 市政进度和可研项目 |
| `government` | 政体 |
| `policies` | 政策槽 |
| `economy` | 金币、信仰、科文收入 |
| `diplomacyPublic` | 已遇见文明的公开关系 |
| `governors` | 总督 |
| `trade` | 商路 |
| `cityStates` | 已遇见城邦与使者 |
| `adjacent-units` | 己方单位的 odd-r 相邻六格，只作文字简表 |
| `render-map` | 整张可见图的 SVG，排障时用 |

## 地图

铺城、移动、战线和局势先看图，再回答。不要自己写脚本把地块扫成文字。一次可以要多层。区域图默认半径 8，局部图默认 5，单次最大半径 20。半径是六边形距离，由你指定。

```bash
node scripts/context.mjs --map world
node scripts/context.mjs --map region:city:首都
node scripts/context.mjs --map local:unit:开拓者:5
node scripts/context.mjs --map local:coord:12,18:9 --map world
```

| 层级 | 用来判断 | 图上的重点 |
| --- | --- | --- |
| `world` | 位置、文明、军队和资源大局 | 地貌、海岸、山脉、河流、归属、城市、单位、战略和奢侈资源。不画单格产出 |
| `region` | 一片区域、战线、城市圈 | 地貌、特征、淡水、资源名称、改良、区域、人口。不画每格产出 |
| `local` | 这一步、这一城、这一格 | 产出、吸引力、河流边、悬崖、建筑、生产和己方单位移动力 |

圆心写成 `city:名称或id`、`unit:名称或id`、`coord:x,y` 或 `selection`。半径接在最后，例如 `local:city:首都:7`。打开返回的 `mapViews[].image.path`（PNG）。`places` 是这一层的索引。指定了 `--map` 时，结果不再附带整份 `visibleMap`；只有你另外传入 `--module visibleMap` 才会带上全部地块。

坐标只用于核对。面向玩家用相对方向和可见锚点，例如「勇士右上方的盐」。邻接规则见 `references/snapshot-schema.md`。

## 结果

返回一份 JSON。

- `status=ready`：用 `context` 回答。`identity.exportId`、`sessionId`、`gameTurn`、`exportedAt` 就是这次点击。`gaps` 里的项目本次没读到，不能当成「游戏里没有」，其余项目照常使用。
- `status=needs-game-refresh`：游戏里还没有写完的导出。把 `userActions` 告诉玩家，请其点击「更新战情」。不要用历史文件顶上。
- `status=runtime-error`：日志或 Tuner 读失败。按 `userActions` 排障。必要时再读 `references/mod-usage-guide.md`。

## 回答

沿用用户当前语言。中文使用文明 6 中文术语，英文使用英文术语。多人局、战争迷雾或信息限制实际影响结论时，用一句话说明本地玩家可见边界。不要要求玩家提供隐藏地图、不可见单位、未遇见文明或其他玩家的私人状态。

数据够用时直接给本回合可执行安排。按问题从「已确认、本回合优先级、建议、风险、仍需关注」里选用，不必每项都写。

## 安装

安装或更新时读取 `references/mod-usage-guide.md`。安装器写入本机 `runtime.json`。若返回未注册，请用户从项目 checkout 或 release tooling 重新运行 Skill 安装。

`npm run copilot`、handoff 和 doctor 只用于排障和跨机流程，不是日常步骤。
