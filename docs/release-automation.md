# Release 自动化

本项目发布目标是同时产出 GitHub Release、Steam Workshop 可用 Mod 内容、Agent Skill 和本地工具包。

## 标准流程

1. 更新 `project-version.json`，并让版本一致性测试同步约束 `package.json`、`.modinfo`、Lua、Skill metadata、schema 和 fixture。
2. 在 PR 或 `main` push 上运行 CI：

```bash
npm ci
npm run typecheck
npm test
npm run mod:validate
npm run skill:validate
npm run privacy:check
npm run rc:check -- --format markdown
```

3. 手动运行 Release Candidate workflow，下载 `dist` artifacts 做实机验证。
4. 按 `tests/manual/` 完成 Windows Civ6、多人公平和 Mac Agent handoff 手工 gate。
5. 创建 `vX.Y.Z` tag，触发 Release workflow。
6. GitHub Release 完成后，用同一个版本说明更新 Steam Workshop。

## 本地构建 artifacts

```bash
npm run release:dist
```

输出目录：

```text
dist/
  civ6-ai-copilot-release-vX.Y.Z.zip
  civ6-ai-copilot-mod-vX.Y.Z.zip
  civ6-ai-copilot-skill-vX.Y.Z.zip
  civ6-ai-copilot-release-manifest-vX.Y.Z.json
  rc-check.md
  checksums.txt
```

`dist/` 和 `release/` 是生成物，不进入 git。

## GitHub Actions

- `CI`：PR 和 `main` push 上运行自动 gate，并上传一次构建 artifacts。
- `Release Candidate`：手动触发，生成可下载 RC artifacts。
- `Release`：tag 或手动触发，校验 tag 与 `project-version.json` 一致，生成 artifacts，并创建 pre-release。

## Steam Workshop

Steam 发布保持半自动：仓库负责生成 Mod 内容、描述、changenote 和校验材料；Steam 登录、Steam Guard、预览图、可见性切换和最终提交由发布负责人确认。不要把 Steam 账号密码、个人路径、日志或 Workshop 上传临时文件提交到仓库。
