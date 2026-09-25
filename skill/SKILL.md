---
name: civ6-ai-copilot
description: 读取 Civilization VI civ6-ai-copilot Mod 最后一次成功汇总的本地玩家可见战情。按清单选择模块，为发展、城市、科技、市政、政策、军事、海军、定居和多人公平问题提供建议。
version: 0.3.5
compatVersion: "0.3"
---

# civ6-ai-copilot

## 怎么使用

玩家点击「更新战情」并看到「简报已汇总」后，当前对局就是这一次导出。从本 Skill 目录调用，不要找仓库、不要选工作目录，也不要搜索历史 snapshot、handoff 或自己写解析脚本。

先看简报：

```bash
node scripts/context.mjs
```

需要看地时再要图，需要一座城或一个单位的明细时再展开。一次综合问答最多再加一张图或一次展开，并核对 `exportId` 相同。

```bash
node scripts/context.mjs --map world
node scripts/context.mjs --map local:city:首都:5
node scripts/context.mjs --city 首都
node scripts/context.mjs --unit 开拓者
```

`--raw` 只把原始导出写到文件并返回路径，供排障。不要把该文件读进日常分析。

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

- `status=ready`：用 `brief` 回答。需要位置时看 `mapViews`，需要明细时看 `detail`。`identity.exportId` 必须和这几步一致。`gaps` 里的事项保持未知：未采集不能写成 0，城邦不可用不能写成安全，地图截断不能写成完整战场。`upgradeCost` 为 0 不是免费升级。不知道价格和许可时，不能断言购买更划算。文明特性和当前队列不是玩家已经选定的长期路线。
- `status=needs-game-refresh`：游戏里还没有写完的导出。把 `userActions` 告诉玩家，请其点击「更新战情」。不要用历史文件顶上。
- `status=runtime-error`：日志或 Tuner 读失败。按 `userActions` 排障。必要时再读 `references/mod-usage-guide.md`。

## 回答

沿用用户当前语言。中文使用文明 6 中文术语，英文使用英文术语。多人局、战争迷雾或信息限制实际影响结论时，用一句话说明本地玩家可见边界。不要要求玩家提供隐藏地图、不可见单位、未遇见文明或其他玩家的私人状态。

数据够用时直接给本回合可执行安排。按问题从「已确认、本回合优先级、建议、风险、仍需关注」里选用，不必每项都写。

## 安装

更新时只替换整个技能目录。分析程序在 `scripts/context-runtime.mjs`，和 `SKILL.md` 是同一份版本。不要再用另一个旧工具目录里的校验器核对版本。安装细节见 `references/mod-usage-guide.md`。

`npm run copilot`、handoff 和 doctor 只用于排障和跨机流程，不是日常步骤。
