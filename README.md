# civ6-ai-copilot

`civ6-ai-copilot` 是面向 Civilization VI 的本地可见情报副官。它通过一个被动 InGame UI Mod 汇总玩家理论可见的局势，再交给 Agent Skill 和本地工具分析，帮助玩家做发展、城市、科技、市政、政策、军事、海军、定居和多人公开态势判断。

它不会操作游戏，不读取隐藏地图，不导出不可见单位，不收集其他玩家私人状态，也不修改规则、地图、单位、资源、外交、生产、存档或网络同步状态。

## 核心价值

- 用结构化战情减少反复描述和手工拼上下文。
- 只基于本地玩家可见信息，适合多人公平边界。
- 游戏内面板保持简洁；详细诊断交给桌面工具。
- 信息不足时，skill 会指出需要在战情简报中选择哪个按钮。

## 开始使用

普通玩家请阅读 [玩家使用指南](docs/user-guide.md)。这里是唯一的玩家安装、更新和日常使用入口。

开发者、内测者和发布负责人请阅读 [开发者手动安装与测试运行簿](docs/mod-installation-and-test.md)。

## 游戏内入口

Civ6 左上 LaunchBar 会出现副官入口。打开后，面板提供：

- 「汇总本回合」
- 「更新地图情报」
- 「回合开始自动汇总」
- 「城市运营」「军事态势」「资源库存」
- 「科技市政」「政体政策」「公开外交」
- 「完整战情简报」

按钮说明放在鼠标悬浮提示中；面板正文只显示当前状态和可执行动作。

## 多人公平

`civ6-ai-copilot` 默认只汇总本地玩家理论可见信息。对不可见单位、隐藏地图、未遇见文明和其他玩家私人队列，skill 只能做风险推断，不能写成事实。

多人局使用前，请遵守房间规则和同局玩家约定。

## 文档

- [玩家使用指南](docs/user-guide.md)
- [语言与信息架构](docs/product-language.md)
- [项目定义](docs/project-definition.md)
- [游戏内面板设计](docs/mod-ui-sync-design.md)
- [AI 可分析视图](docs/ai-analysis-view.md)
- [Snapshot 协议](docs/snapshot-protocol.md)
- [开发者手动安装与测试运行簿](docs/mod-installation-and-test.md)
- [GitHub 与 Steam Workshop 发布流程](docs/steam-workshop-publishing.md)

## 当前状态

当前版本：`0.1.0`。首个公开测试版将同时准备 Steam Workshop Mod、GitHub Release、Agent Skill 和本地工具包。
