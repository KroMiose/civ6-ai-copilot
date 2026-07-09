# civ6-ai-copilot - Agent Guidelines

本仓库维护目标是“文明6多人可用智能副官 skill + 被动 UI Mod 导出器”。所有新增实现都必须服务于该目标。

## 工作原则

- 默认使用简体中文编写项目定义、设计文档、skill 文档和面向用户的报告。
- 代码、schema 字段名、文件名、包名使用英文和 kebab-case / camelCase，避免中文路径影响跨平台使用。
- 不提交本地采集材料、原始日志、API key 或个人路径。
- 不硬编码本机路径。所有工具必须接受参数、环境变量或自动发现路径。
- 多人模式优先保护公平性：默认只导出本地玩家理论可见信息，不导出隐藏地图、未遇见文明、不可见单位、秘密外交或其他玩家私人信息。
- Mod 必须是被动 UI/诊断导出器，不修改游戏规则、地图、单位、资源、玩家状态或网络同步状态。
- 任何会影响关键设计的变更，先更新 `docs/project-definition.md` 的决策表或新增 ADR，再等待项目所有者确认。
- macOS/Aspyr 真实游戏若没有 `Lua.log`，在玩家点击 Copilot 同步后使用 `npm run tuner-bridge -- --output-dir "<snapshot-dir>" --state civ6_ai_copilot` 读取 Mod 已缓存的分块。
- 若用户声明游戏界面由用户自己操作，AI 不得再使用 Computer Use/GUI 点击；只给出需要用户点击的 Copilot 面板按钮，并在终端侧运行 bridge/tuner-bridge、validate、preflight、handoff。

## 目录约定

- `mod/`：文明6 Mod 源码、`.modinfo`、Lua/XML/UI 资源。
- `skill/`：可发布的 AI skill 源码，包含 `SKILL.md`、`scripts/`、`references/`、`agents/`。
- `tools/`：桌面侧 CLI、日志桥接、快照校验、地图渲染、打包脚本。
- `schemas/`：JSON Schema、示例 contract、版本迁移说明。
- `tests/`：自动化测试、脱敏 fixtures、回归样例。
- `docs/`：项目定义、架构说明、协议说明、测试计划、ADR。
- `research/`：社区项目调研笔记和非发布原型。不得依赖其中内容作为运行时生产代码，除非经过许可证和质量审查。

## 实现前置规则

- 新增代码前，先确认 `docs/project-definition.md` 中已有对应关键决策；若没有，先新增 ADR 或决策项并等待确认。
- 新增 Mod 功能前，明确它是否可能影响 multiplayer sync；若有风险，停止并等待确认。
- 新增数据字段前，同步更新 `schemas/`、测试 fixtures 和 skill 读取说明。
- 新增 AI 建议逻辑前，确保输入数据带有 `visibility`、`confidence` 和 `source`，避免把推断说成事实。

## 测试要求

- CLI/schema/tooling 代码必须有自动化测试。
- Mod 导出字段必须有脱敏 fixture 和 schema 校验。
- 多人相关能力必须至少有手工测试记录：两名人类玩家、同一局、各自只看到自己的理论可见信息。
- 所有 release candidate 必须通过隐私检查：仓库中不得包含本地存档、运行时 snapshot、原始日志或个人路径。
