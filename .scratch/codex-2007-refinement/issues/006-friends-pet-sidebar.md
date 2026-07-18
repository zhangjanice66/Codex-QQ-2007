# Issue 06：交付独立可收起的好友、宠物与 QQ 秀侧栏

Status: `complete`

## Parent

[Codex 2007：原生结构稳定与 QQ2007 视觉深化](../spec.md)

## What to build

交付一个占用真实工作区列的 QQ 好友栏，包含可收起标题、宠物资料、快捷操作、好友分组、可替换 QQ 秀和固定搜索框。它读取稳定可用的 Codex 宠物状态，无法读取时使用小蓝助手；原生审查、Diff、文件或环境面板打开时与好友栏互斥。

## Acceptance criteria

- [x] 好友栏展开时中央面板自动缩窄，收起时自动扩展，不使用覆盖式定位。
- [x] 好友栏拥有独立滚动区域和固定底部搜索框，宠物和 QQ 秀素材不会溢出卡片。
- [x] 宠物状态有稳定来源时显示已配置宠物，否则显示小蓝助手且不会反复扫描。
- [x] 显示 Codex小蓝、LV07、助手签名、好友分组、在线状态和快捷操作。
- [x] 原生右面板打开时好友栏自动隐藏或切换，任何情况下都不叠加覆盖。

## Blocked by

- [Issue 02](002-stable-window-frame.md)

## Verification

- `node --check macos/assets/renderer-inject.js`
- `node --check macos/scripts/injector.mjs`
- `node --test macos/tests/renderer-inject.test.mjs macos/tests/injector-bootstrap.test.mjs macos/tests/theme-stage.test.mjs`
- 隔离临时 HOME 后执行 `cd macos && npm test`，完整套件通过。
- 展开/收起：真实鼠标点击展开后中央区由 `width=878` 收缩为 `662`，好友列为 `x=962 / width=236`；点击收起后中央区恢复 `width=878`，28px 展开条可见可点击，两个状态的 `friendPass` 均为 `true`。
- 独立滚动：125% 等效视口 `962×585` 下，好友滚动区为 `401px`、内容高 `499px`；真实滚轮使 `scrollTop` 从 0 变为 98，底部搜索框始终保持 `y=525`。
- 响应式：150% 等效视口 `801×487` 下好友列按紧凑规则隐藏，中央区占满剩余空间，文档无横向或纵向溢出，`friendPass: true`；随后恢复实际 `1202×731` 视口。
- 原生右栏：右侧固定为互斥 Dock；真实打开摘要或右侧原生面板时好友栏隐藏，保留 28px 的「环境/好友」恢复条。关闭原生面板后恢复原好友状态，任何情况下均不覆盖中央内容。
- 宠物与素材：实机无稳定宠物节点时使用 `fallback` 小蓝助手，QQ 秀来源为 `theme`，两者均为 `overflow:hidden`；新增稳定宠物节点只触发一次受控重试。合法 deep 主题不提供 decorations 时，payload 回归确认自动获得 `assistant` 与 `qqShow`，显式素材仍优先且热切换会替换旧图。
- 严格生命周期：`--remove` 返回 `true` 且无残留；重新应用 deep 主题后好友栏保持原收起状态，`friendPass: true`。
- 双轴复审：Standards 与 Spec 的全部 finding 已修复，复审均为 PASS，无剩余问题。
