# Civ6 UI Mod 入口调研记录

本文件是 research 记录，不作为运行时依赖。稳定结论已经沉淀到 `docs/mod-ui-sync-design.md`、`mod:validate` 和 Mod 实现中。

## 结论

`civ6-ai-copilot` 的游戏内入口采用 Civ6 原生左上 LaunchBar 的 `ButtonStack`。

实现要点：

- XML 提供 `Civ6AICopilotLaunchItem` / `Civ6AICopilotLaunchPin` 实例。
- Lua 使用 `ContextPtr:LookUpControl("/InGame/LaunchBar/ButtonStack")` 和 `ContextPtr:BuildInstanceForControl(...)` 挂载按钮。
- 挂载后更新 LaunchBar 尺寸，并调用 `LuaEvents.LaunchBar_Resize(stackWidth)`。

## 资料

- CivFanatics “How to add a LUA script with a UI context”：UI context 使用 `AddUserInterfaces`、`Context=InGame`，并搭配 XML/Lua。
- Steam Workshop “UI Plugins Framework”：社区通过明确 UI plugin points 添加 toolbar 按钮或面板。
- UI Plugins Framework README：列出 LaunchBar、PartialScreen、MinimapBar 和 WorldTracker 等挂载点。
- Civ6 原生 `LaunchBar.xml` / `LaunchBar.lua`：按钮栈变化后更新背板并发出 `LuaEvents.LaunchBar_Resize`。

## 约束

- `mod:validate` 拦截静态屏幕坐标入口。
- `mod:validate` 要求 Lua 挂载 `/InGame/LaunchBar/ButtonStack` 并调用 `LuaEvents.LaunchBar_Resize`。
- 文档和 skill 对用户的提示统一为“点击左上 LaunchBar 的 Copilot 图标按钮”。
