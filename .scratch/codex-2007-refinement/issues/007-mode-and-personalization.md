# Issue 07：交付原版/深度仿制两态换肤及个性化配置

Status: `complete`

## Parent

[Codex 2007：原生结构稳定与 QQ2007 视觉深化](../spec.md)

## What to build

让用户无需重装即可在原版 Codex 和深度仿制版之间切换，并持久保存张奈斯、个性签名、在线状态、等级、宠物和 QQ 秀等个性化内容。视图切换只改变呈现，不改变 Codex 原生内容和功能。

## Acceptance criteria

- [x] 原版 Codex 清除深度换肤状态，仅保留一个小型恢复按钮。
- [x] 深度仿制版启用完整 Codex 2007 标题、工具栏、好友栏和状态栏结构。
- [x] 两种视图可来回切换且无需重启或重新安装，不产生重复注入组件。
- [x] 昵称张奈斯、签名、在线/忙碌/离线、等级、宠物和 QQ 秀配置重启后仍保留。
- [x] 模式切换前后项目、消息、输入、模型和原生右面板行为一致。

## Blocked by

- [Issue 03](003-native-project-sidebar.md)
- [Issue 05](005-qq2007-composer.md)
- [Issue 06](006-friends-pet-sidebar.md)

## Verification

- `node --check macos/scripts/codex-2007-personalization.mjs macos/scripts/injector.mjs`
- `node macos/tests/renderer-inject.test.mjs`
- `cd macos && npm test`，完整套件通过。
- 视图生命周期 fixture 与实机 CDP 均执行 deep → native → deep：左栏、会话和输入区保持原生节点身份，原版恢复按钮可见，回切后深度结构恢复且 style/chrome 始终各 1。
- 隔离 HOME 更新昵称、签名、等级、忙碌状态、宠物和 QQ 秀后，单一 deep preset 与活动主题均保留配置；原版视图不复制或改写个性化数据。
- 并发与失败原子性：两个并发个性化进程由独占锁串行化；无效目标、不可写 config、symlink 图片和 symlink preset 目录均被拒绝，锁、`.tmp` 与 rollback 文件无残留。
- `preset-codex-1907-compatible` 已从仓库、验收矩阵和本机播种缓存删除。
- 双轴复审：Spec 与 Standards 最终均为 PASS，无剩余 finding。
