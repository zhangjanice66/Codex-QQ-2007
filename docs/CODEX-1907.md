# Codex 2007

为 macOS Codex Desktop 26.715.21425 制作的一套蓝白复古主题：

- `preset-codex-1907-deep`：使用 XP Luna 窗口框、QQ2007/Office 2003 工具栏、稳定三栏结构、原生会话输出、原生输入区和可收起好友面板。预设 ID 为兼容旧安装而保留 `1907`。

主题使用昵称「张奈斯」、签名「别迷恋姐，姐只是个传说。」和 `LV07`。深度版好友面板使用低分辨率 QQ 秀时代风格的原创 AI 企鹅「Codex 小蓝」，窗口标题动态显示为「Codex 2007 · 当前项目」。

深度版不会把普通回复包装成消息气泡，也不会向回复添加头像、发送者或时间；仅对真实代码块使用 QQ2007 风格的蓝灰凹陷边框。左侧项目、任务、置顶、折叠与账号区域保留 Codex 原生节点和行为，皮肤不复制、搬运或重新排序项目；主工具栏已有的入口不在左栏重复显示。好友栏收起状态保存在本机。

## 安装与切换

先退出 Codex，再运行：

```bash
cd macos
./scripts/install-dream-skin-macos.sh --no-launch
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh \
  --id preset-codex-1907-deep
```

深度版顶部工具栏的「换肤」按钮可切换到原版 Codex；原版界面只保留一个小型「换肤」恢复按钮，点击后回到深度仿制版。选择会保存在本机，不需要重装或重启。旧的 `preset-codex-1907-compatible` 已删除。

完全恢复官方外观：

```bash
~/.codex/codex-dream-skin-studio/scripts/restore-dream-skin-macos.sh \
  --restore-base-theme --restart-codex
```

## 个性化

统一命令会把昵称、签名、等级、状态、宠物和 QQ 秀写入深度版，因此切换到原版视图或重新启动后不会丢失：

```bash
~/.codex/codex-dream-skin-studio/scripts/personalize-codex-2007-macos.sh \
  --nickname "张奈斯" \
  --signature "别迷恋姐，姐只是个传说。" \
  --level "LV09" \
  --status busy \
  --assistant "/path/to/pet.png" \
  --qq-show "/path/to/qq-show.png"
```

参数可以单独使用。图片会在本机转换为 PNG，限制为 16 MB。

原有在线状态快捷命令继续可用：

```bash
~/.codex/codex-dream-skin-studio/scripts/set-codex-1907-status-macos.sh --status online
~/.codex/codex-dream-skin-studio/scripts/set-codex-1907-status-macos.sh --status busy
~/.codex/codex-dream-skin-studio/scripts/set-codex-1907-status-macos.sh --status offline
```

原有 QQ 秀快捷命令也继续可用：

```bash
~/.codex/codex-dream-skin-studio/scripts/replace-codex-1907-qq-show-macos.sh \
  --file "/path/to/new-qq-show.png"
```

重新安装会用仓库内置默认值重新播种深度版预设；视图切换和应用重启不会覆盖个性化内容。

## 兼容边界

深度版依赖 Codex 当前 DOM 结构。应用升级后，项目识别、好友栏互斥或工具栏桥接可能需要更新选择器；原版视图不改动这些原生节点。主题不修改 `.app`、`app.asar` 或代码签名。

## 实现原则

本主题不是在 Codex 页面上叠加一张 QQ2007 皮肤，而是在不破坏 Codex 原生功能和输出结构的前提下，将窗口框架、面板边界、配色和控件外观重构为 QQ2007 桌面客户端风格。
