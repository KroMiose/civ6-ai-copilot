# GitHub 与 Steam Workshop 发布流程

`civ6-ai-copilot` 推荐同时提供 GitHub release 和 Steam Workshop 订阅安装。普通玩家入口应放在 README 和 `docs/user-guide.md`；本文面向发布负责人。

## 1. 发布材料

GitHub release 面向开发者、审查者、非 Steam 用户和手动安装用户。应包含：

- 源码 tag。
- Mod package。
- Skill package。
- 统一 release bundle。
- Release notes。
- 版本、兼容版本、schema/protocol 变化说明。

Steam Workshop 面向普通 Steam 版 Civ6 玩家。应包含：

- Mod 内容目录。
- Workshop 标题、描述、标签、预览图。
- Changenote。
- `publishedfileid`，创建后写入发布记录。
- README 顶部的 Workshop 订阅链接。

## 2. 预发布检查

```bash
npm run typecheck
npm test
npm run mod:validate
npm run skill:validate
npm run privacy:check
npm run rc:check -- --format markdown
npm run release:package -- --output-dir ./release --clean
npm run release:validate -- --bundle-dir ./release/civ6-ai-copilot-release
```

手工 gate 通过后接入：

```bash
npm run evidence:validate -- --evidence "<manual-evidence.json>" --format markdown
npm run rc:check -- --manual-evidence "<manual-evidence.json>" --format markdown
```

## 3. GitHub release

1. 确认 `project-version.json`、`.modinfo`、skill metadata 和 release notes 版本一致。
2. 生成 release bundle。
3. 校验 release manifest。
4. 创建 Git tag。
5. 上传 release bundle 和必要的独立 Mod/skill 包。
6. 在 release notes 中说明：
   - 新功能。
   - 修复。
   - 兼容版本。
   - 是否修改 schema/protocol。
   - 已通过的自动 gate 和仍需用户环境确认的事项。

## 4. Steam Workshop

推荐先在 Windows 上使用 Civilization VI Development Tools / ModBuddy / Steam Uploader 验证内容目录，再创建或更新 Workshop item。

准备元数据：

- 标题：`Civ6 AI Copilot`
- 简短描述：本地玩家可见情报汇总 + 回合分析工作流。
- 标签：按 Civ6 Workshop 当前可用标签选择 UI / Utility / Multiplayer-compatible 等。
- 预览图：使用项目自制图，不使用未经授权素材。
- Changenote：对应 GitHub release notes。

流程：

1. 使用 `npm run mod -- package --output-dir ./release --clean` 生成内容目录。
2. 在 Civ6 开发工具中创建或选择 Workshop item。
3. 设置标题、描述、标签、可见性、内容目录和预览图。
4. 先使用 private 或 friends-only 可见性测试。
5. 记录 `publishedfileid`。
6. 邀请测试者订阅，验证 Additional Content、对局加载、战情简报、bridge/tuner-bridge 和多人公平。
7. 通过测试后改为 public。

## 5. Workshop 描述建议

描述应清楚表达：

- 这是 Civ6 UI/utility Mod。
- Mod 汇总本地玩家理论可见情报。
- Mod 不修改规则、地图、单位、资源、外交、生产或存档。
- AI 建议需要搭配本地工具和 Agent Skill。
- 多人使用前应遵守房间规则和玩家约定。

避免把技术协议、checksum、chunk、exportId 或长排障命令放进 Workshop 首页；这些内容链接到 GitHub 文档即可。

## 6. 发布后维护

每次发版一并更新：

- `project-version.json`
- `.modinfo`
- skill frontmatter
- schema/protocol 文档
- GitHub release
- Steam Workshop changenote
- release bundle manifest

如果 `compatVersion` 的 `a.b` 变化，Mod 与 skill 必须作为兼容组合一起发布，并在 release notes 中提示用户一并升级。

## 7. 参考资料

- Steam Workshop Implementation Guide: <https://partner.steamgames.com/doc/features/workshop/implementation>
- ISteamUGC Interface: <https://partner.steamgames.com/doc/api/ISteamUGC>
- Civilization VI Steam Workshop: <https://steamcommunity.com/app/289070/workshop/>
- Civ6 Mod 创建基础社区文档: <https://civilization.fandom.com/wiki/Modding_(Civ6)/Basics_of_Mod_Creation>
- Civ6 SDK/ModBuddy 社区文档: <https://jonathanturnock.github.io/civ-vi-modding/docs/sdk-overview/>
