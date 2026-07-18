# macOS 预设主题

`preset-codex-1907-deep/` 是本仓库的主预设，包含 QQ2007 深度布局配置、背景、原创小蓝助手和可替换 QQ 秀。

其他预设是程序化生成的抽象回退主题，用于验证通用主题切换能力。安装器只管理 `preset-*`，不会覆盖用户通过定制入口保存的 `custom-*` 主题。

预设结构：

```text
preset-<slug>/
├── theme.json
├── background.jpg
├── assistant.png    # 可选
└── qq-show.png      # 可选
```

单独校验 QQ2007 预设：

```bash
node macos/scripts/injector.mjs --check-payload \
  --theme-dir macos/presets/preset-codex-1907-deep
```

图片必须是预设目录内的普通文件，不得使用符号链接或越过目录；单文件最大 16 MB，尺寸最大 16384px，总像素不超过 50MP。
