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
- 简短描述：Civ6 回合规划 AI 副官：把当前局势整理成战情简报，帮助玩家获得城市、科技、市政、政策、军事和定居建议。
- 标签：按 Civ6 Workshop 当前可用标签选择 UI / Utility / Multiplayer-compatible 等。
- 预览图：使用项目自制图，不使用未经授权素材。
- Changenote：对应 GitHub release notes。
- 语言：按 `docs/steam-workshop-copy.md` 分别填写 English 和 Simplified Chinese。不要把中文说明写入 English 语言页。

默认更新规则：

- 如果项目所有者没有特殊要求，SteamCMD 只更新 Mod 内容目录和 changenote。
- SteamCMD VDF 默认只包含 `appid`、`publishedfileid`、`contentfolder`、`changenote`。
- 正式发布必须同时包含 `contentfolder` 和 `changenote`，并在发布后验证公开 changelog 页面；SteamCMD 在没有内容变化时可能返回 `Success` 但不展示新的改动说明。
- 不要在默认 SteamCMD VDF 中包含 `title`、`description`、`previewfile`、`visibility` 或 `language`，避免把网页维护的多语言内容覆盖成单语言。
- 需要编辑标题、描述、预览图、可见性或语言页时，使用浏览器进入 Steam Workshop 编辑页，按 English 和 Simplified Chinese 分别更新和验证。

SteamCMD 建议安装在长期目录，不放在 `/tmp`：

```bash
STEAMCMD_HOME="${STEAMCMD_HOME:-$HOME/Tools/steamcmd}"
```

流程：

1. 使用 `npm run mod -- package --output-dir ./release --clean` 生成内容目录。
2. 使用只包含内容目录和 changenote 的 SteamCMD VDF 更新 Workshop item。
3. 先使用 private 或 friends-only 可见性测试。
4. 记录 `publishedfileid`。
5. 邀请测试者订阅，验证 Additional Content、对局加载、战情简报、bridge/tuner-bridge 和多人公平。
6. 通过测试后改为 public。
7. 如需更新标题、描述、标签、可见性或预览图，再进入网页编辑器处理。

### 语言填写

Steam Workshop 标题和描述是按语言保存的。Steamworks `SetItemUpdateLanguage` 未设置时会默认写入 `english`，所以通过 SteamCMD 的普通 `title` / `description` VDF 更新通常会落到 English 语言页。

推荐在网页编辑器里手动维护两份语言：

1. 语言选择 `英语` / `English`，粘贴 `docs/steam-workshop-copy.md` 的 English title 和 English description。
2. 语言选择 `简体中文` / `Simplified Chinese`，粘贴同一文件的 Simplified Chinese title 和 description。
3. 保存后分别切回两个语言确认内容没有串语言。

## 5. Workshop 描述建议

描述应清楚表达：

- 这是 Civ6 回合规划 AI 副官和 UI/utility Mod。
- 它把当前回合局势整理成 AI 可分析的战情简报，减少玩家反复手动描述上下文。
- 它能支持城市生产、科技市政、政策换卡、军事防守、海军探索、资源规划和定居选址等常见问题。
- AI 建议需要搭配本地工具和 Agent Skill。
- Workshop 首页必须直接放 Mod 安装步骤和可复制的 Agent Skill 安装提示词，不把它们藏进深层 GitHub 文档。
- Mod 不修改规则、地图、单位、资源、外交、生产或存档。
- 多人使用前应遵守房间规则和玩家约定。
- “本地玩家可见”“多人公平边界”等内容放在安全说明中，不作为首屏核心卖点。

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
