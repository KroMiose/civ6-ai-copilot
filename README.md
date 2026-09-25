# civ6-ai-copilot

语言 / Language: [简体中文](README.md) | [English](README_en.md)

`civ6-ai-copilot` 是面向 Civilization VI 的 AI 回合副官。它在游戏内提供「战情简报」面板，把当前局势整理成 AI 可以直接分析的材料，帮助你更快获得城市、科技、市政、政策、军事、海军和定居建议。

它不会自动操作游戏，也不会修改规则、地图、单位、资源、外交、生产、存档或网络同步状态。

## 安装

1. 订阅 Steam 创意工坊支持 Mod：
   <https://steamcommunity.com/sharedfiles/filedetails/?id=3760876275>
2. 启动 Civilization VI。
3. 在 `额外内容` 中启用 `Civ6 AI Copilot`。
4. 开始或加载一局游戏。

如果 Mod 没有出现，先重启 Steam 和 Civ6，并确认 Workshop 内容已经下载完成。

## 安装 AI Skill

把下面这段发给你的本地 Agent，例如 Codex 或 Claude Code：

```text
请从 https://github.com/KroMiose/civ6-ai-copilot 安装或更新 civ6-ai-copilot Agent Skill。
优先使用最新 GitHub Release 里的 skill/civ6-ai-copilot 目录，整份替换现有技能目录。分析程序已经在技能目录内，不要再单独安装或校验一份旧工具。
完成后告诉我 SKILL.md 里的版本，以及是否需要开启新对话。
```

以后更新可以直接复制：

```text
请从 https://github.com/KroMiose/civ6-ai-copilot/releases 选择版本最高的发布（包括预发布），下载其中的 skill/civ6-ai-copilot 目录，整份替换我现有的技能目录。不要用旧的本地工具去校验新技能的版本号。完成后告诉我 SKILL.md 里的版本。Mod 的 compatVersion 仍须是 0.3；如果 Steam Workshop 的 Mod 还没更新，请提醒我在游戏内点击「更新战情」重新生成快照。
```

从 `0.1.x` 升级到 `0.3` 协议时，Mod、Skill 和本地工具必须一起更新；旧快照不能与 0.3 协议混用。`0.3.6` 起只替换技能目录。分析程序在技能目录内。游戏内 `0.3.1` Mod 可以继续使用。

## 第一次使用

1. 进入 Civ6 对局。
2. 点击左上角的副官入口。
3. 在「战情简报」中点击「更新战情」，刷新完整战情。
4. 回到 Agent，发送：

```text
我刚刚在 Civ6 的战情简报中汇总了本回合情报。请使用 civ6-ai-copilot skill 读取最新战情，告诉我本回合应当如何行动
```

如果 Agent 说缺少某类情报，就回到「战情简报」点击「更新战情」刷新后，再继续提问。

## 可以问什么

```text
这些城市接下来分别造什么？
```

```text
下一条科技和市政怎么走？
```

```text
我现在适合开战吗？如果不适合，前线怎么防？
```

```text
政策卡怎么换，资源该怎么用？
```

```text
首都东边的这片海岸、河流和南边小岛适合铺城吗？如何选址？
```

## 信息不足时

Agent 会说明缺少哪类情报以及它影响的判断。需要更新时，回到 Civ6 的「战情简报」点击「更新战情」，刷新完整战情，包括地图、己方城市与单位、总督、商路及已遇见城邦信息。

「每回合自动更新」默认关闭。开启后，每个本地玩家回合都会自动刷新完整战情，包括当前可见地图；也可随时点击「更新战情」手动刷新。

## 多人局

多人房间如果限制 UI 或 utility Mod，请先遵守房间规则。这个项目的目标是做回合规划辅助，不是作弊工具。

## 社区与联系

- QQ 交流群：[636925153](https://qm.qq.com/q/eT30LxDcSA)
- Discord：[Discord Channel](https://discord.gg/eMsgwFnxUB)

## 更多文档

- [开发者与维护者文档索引](docs/README.md)

当前预发布版本：`0.3.6`。
