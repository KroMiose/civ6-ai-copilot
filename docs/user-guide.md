# 玩家使用指南

本文面向普通玩家。日常使用只需要安装 Civ6 Mod、安装 Agent Skill，然后在游戏内汇总战情，回到 Agent 对话中提问。

## 准备

- Civilization VI。
- Steam Workshop 订阅的 `Civ6 AI Copilot` Mod。
- 支持 Agent Skills 或能读取本地文件、运行本地工具的 Agent 客户端，例如 Codex、Claude Code 等。

## 安装 Civ6 Mod

Steam Workshop 公开后：

1. 打开 `Civ6 AI Copilot` 的 Steam Workshop 页面。
2. 点击订阅。
3. 启动 Civilization VI。
4. 进入 `Additional Content`，启用 `Civ6 AI Copilot`。
5. 开始或加载一局游戏。

如果 Mod 没有出现在 `Additional Content`，先重启 Steam 和 Civ6，再确认订阅内容已经下载完成。

## 安装或更新 Agent Skill

把下面的请求发给你的 Agent：

```text
请从 https://github.com/KroMiose/civ6-ai-copilot 安装或更新 civ6-ai-copilot Agent Skill 与本地助手工具。

优先使用最新 GitHub Release 中的 civ6-ai-copilot-release 包：把 skill/civ6-ai-copilot 安装到当前 Agent 的用户级 skills 目录，文件夹名保持 civ6-ai-copilot；同时保留 tooling 目录，之后读取 Civ6 战情材料时使用。

如果还没有 Release，就从仓库下载 skill/ 目录和必要的 tooling 源码做临时安装。

安装完成后，请告诉我 skill 版本、compatVersion、本地助手工具目录，以及是否需要重启客户端或开启新对话。
```

更新时可以直接说：

```text
请更新我的 civ6-ai-copilot skill 和本地助手工具到最新版本。
```

如果 Agent 提示需要重启客户端或开启新对话，照做一次即可。

## 第一次使用

1. 进入 Civ6 对局。
2. 点击左上 LaunchBar 的副官入口。
3. 在「战情简报」中选择「汇总本回合」。
4. 回到 Agent，发送：

   ```text
   我刚刚在 Civ6 的战情简报中汇总了本回合情报。请使用 civ6-ai-copilot skill 读取最新战情，告诉我本回合优先级。
   ```

第一次读取时，Agent 可能会请求访问本地 Civ6 日志或运行本地助手工具。允许后，它会把游戏内战情转换为可分析材料。

本地助手工具的标准入口是：

```bash
npm run copilot -- --intent turn-priority --clean
```

Agent 会通过这条命令刷新当前战情、生成分析材料，并按输出读取对应 handoff 文件。

## 常见提问

```text
这些城市接下来分别造什么？
```

```text
我现在适合开战吗？如果不适合，前线怎么防？
```

```text
下一条科技和市政怎么走，哪些尤里卡/鼓舞要优先完成？
```

```text
这片海岸、河流和南边小岛适合铺城吗？
```

```text
这局多人只基于我可见的信息，帮我判断战争风险。
```

## 信息不足时

Agent 会说明需要更新哪类情报。回到 Civ6 的「战情简报」，按提示选择对应按钮：

- 「更新地图情报」：地图、前线、海军、侦察、定居和战争判断。
- 「城市运营」：逐城生产、住房、区域和产出。
- 「军事态势」：单位行动、防守和调兵。
- 「科技市政」：科技、市政、尤里卡和鼓舞路线。
- 「政体政策」：政体、政策槽和已插政策。
- 「资源库存」：战略资源、奢侈品、升级、维护和交易。
- 「公开外交」：已遇见文明、公开关系和公开军事分。
- 「完整战情简报」：首次使用、版本变化、诊断异常或多个专题都需要更新。

更新后回到原对话继续提问，不需要重新解释整局。

## 多人局

Mod 默认只汇总本地玩家理论可见信息。建议也只应基于这些信息做判断。不可见单位、隐藏地图、未遇见文明或其他玩家私人状态，只能作为风险推断。

多人房间如果限制 UI 或 utility Mod，请遵守房间规则。

## 开发者与手动安装

普通玩家优先使用 Steam Workshop 与 Agent 自动安装。手动安装 Mod、运行 bridge、生成 release bundle 和发布前检查，请看 [开发者手动安装与测试运行簿](mod-installation-and-test.md)。
