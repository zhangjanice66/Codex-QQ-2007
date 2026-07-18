# Codex QQ 2007 for macOS

把 macOS 上的 Codex Desktop 重构成 Windows XP 时代的 QQ2007 桌面客户端风格，同时保留 Codex 原生项目、任务、消息、代码块、Diff、审批与输入功能。

> 非 OpenAI、Tencent 或 QQ 官方项目。本项目不修改 Codex.app、`app.asar` 或代码签名。

## 当前版本

- 版本：`1.7.0`
- 已测试：macOS 26.3、Apple M4、Codex Desktop 26.715.21425
- 主预设：`preset-codex-1907-deep`
- 视图：QQ2007 深度仿制 / 原版 Codex
- 旧的 `preset-codex-1907-compatible` 已移除

## 主要效果

- XP Luna 蓝色标题栏与 Office 2003 风格工具栏
- 稳定的左侧项目、中央会话、右侧好友三栏布局
- 彩色 16×16 / 24×24 位图风格图标
- Codex 原生消息结构，仅给真实代码块增加复古框体
- 可收起的 Codex 好友、宠物、在线状态与可替换 QQ 秀
- 顶部「换肤」在深度仿制版与原版 Codex 间切换
- 昵称、签名、等级、状态、宠物和 QQ 秀可本地个性化
- 一键验证与一键恢复官方外观

## 安装

先正常启动一次 Codex，随后完全退出 Codex：

```bash
git clone git@github.com:zhangjanice66/Codex-QQ-2007.git
cd Codex-QQ-2007/macos
./scripts/install-dream-skin-macos.sh --no-launch

~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh \
  --id preset-codex-1907-deep --no-apply

~/.codex/codex-dream-skin-studio/scripts/start-dream-skin-macos.sh \
  --restart-existing
```

安装脚本会在桌面创建启动、定制、验证和恢复入口。也可以直接双击 `macos/Install Codex Dream Skin.command`。

## 换肤

深度仿制版顶部工具栏的「换肤」进入原版 Codex。原版左上角保留一个小型「换肤」按钮，用于返回深度仿制版。选择保存在本机，应用重启和热重载后仍然有效。

## 个性化

```bash
~/.codex/codex-dream-skin-studio/scripts/personalize-codex-2007-macos.sh \
  --nickname "张奈斯" \
  --signature "别迷恋姐，姐只是个传说。" \
  --level "LV07" \
  --status online \
  --assistant "/path/to/pet.png" \
  --qq-show "/path/to/qq-show.png"
```

所有参数均可单独使用。状态只接受 `online`、`busy`、`offline`。更多说明见 [Codex 2007 使用文档](./docs/CODEX-1907.md)。

## 验证与恢复

```bash
cd macos
npm test

./scripts/verify-dream-skin-macos.sh

./scripts/restore-dream-skin-macos.sh \
  --restore-base-theme --restart-codex
```

## 目录

```text
docs/                   QQ2007 使用说明
macos/assets/           CSS、注入模板与原创位图图标
macos/presets/          QQ2007 深度预设及抽象回退预设
macos/scripts/          安装、启动、注入、验证、个性化与恢复
macos/tests/            单元测试和回归测试
macos/menubar/          可选 SwiftBar 菜单栏入口
```

## 安全边界

- CDP 仅监听 `127.0.0.1`，运行换肤时不要启动不可信的本机程序。
- 不修改官方 Codex 二进制、安装包或签名。
- 不读取或改写 API Key、Base URL 与模型供应商配置。
- 应用升级可能改变原生 DOM；升级后请先运行 Verify。

## 来源与许可

本项目基于 [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin) 的 macOS 运行引擎继续开发，软件代码沿用 MIT License。

QQ2007 深度预设中的背景、宠物和 QQ 秀为本项目生成的虚构素材，不包含 Tencent 官方企鹅或 QQ 客户端资源。`Codex`、`OpenAI`、`QQ`、`Tencent` 及相关标识归各自权利人所有。详见 [NOTICE](./NOTICE.md)。
