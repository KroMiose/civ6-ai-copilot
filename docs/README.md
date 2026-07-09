# 文档索引

本目录保存 `civ6-ai-copilot` 的玩家指南、设计说明、开发者运行簿和发布文档。普通玩家优先阅读仓库根目录的 `README.md`；维护者再从本索引进入细节文档。

## 玩家文档

- `user-guide.md`：从 Steam Workshop、Codex/Claude Code 等 Agent、游戏内战情简报开始使用。
- `product-language.md`：用户可见表达、文档分工和禁用词。
- `mod-ui-sync-design.md`：游戏内战情简报按钮语义，适合想了解“点哪个按钮会汇总什么”的用户。
- `ai-analysis-view.md`：AI 如何使用本地玩家可见材料，以及为什么信息不足时会要求更新指定模块。

## 产品与架构

- `project-definition.md`：项目目标、非目标、多人公平边界、架构分层、版本策略和关键决策。
- `snapshot-protocol.md`：Mod 到桌面工具的 marker 协议、`bridge` / `tuner-bridge` 输出和版本兼容。

## 开发与测试

- `mod-installation-and-test.md`：开发者手动安装、情报汇总、诊断、bridge、tuner-bridge、handoff 和手工证据流程。
- `windows-mac-workflow.md`：Windows 运行 Civ6，Mac 运行 Agent Skill 的跨设备工作流。
- `current-status.md`：当前 release readiness、自动 gate、手工 gate 和发布前命令。
- `../tests/manual/`：Windows 冒烟、双人多人公平、Mac Agent handoff 和结构化证据模板。

## 发布

- `release-automation.md`：本地 artifacts、GitHub Actions、tag release 和 Steam 半自动发布分工。
- `steam-workshop-copy.md`：Steam Workshop 英文和简体中文标题、描述、changenote 文案。
- `steam-workshop-publishing.md`：GitHub release 与 Steam Workshop 发布步骤、元数据和检查清单。

## 维护原则

README 和玩家指南只讲核心价值、安装、更新和日常使用。手动安装、命令验证、发布 gate 和排障细节放在开发者文档中。排障经验应沉淀为诊断命令、测试模板或设计约束；不把临时过程、个人环境、原始日志、真实采集材料或旧实现叙事写进主文档。
