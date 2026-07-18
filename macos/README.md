# Codex QQ 2007 · macOS 引擎

这里是 Codex QQ 2007 的 macOS 安装、注入、验证和恢复引擎。项目总览与安装步骤见 [仓库 README](../README.md)，QQ2007 个性化说明见 [docs/CODEX-1907.md](../docs/CODEX-1907.md)。

## 常用命令

```bash
# 安装但暂不启动
./scripts/install-dream-skin-macos.sh --no-launch

# 选择 QQ2007 深度预设
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh \
  --id preset-codex-1907-deep --no-apply

# 启动或重启应用皮肤
~/.codex/codex-dream-skin-studio/scripts/start-dream-skin-macos.sh \
  --restart-existing

# 验证
./scripts/verify-dream-skin-macos.sh

# 恢复官方外观
./scripts/restore-dream-skin-macos.sh \
  --restore-base-theme --restart-codex
```

## 开发检查

```bash
npm test
node scripts/injector.mjs --check-payload \
  --theme-dir presets/preset-codex-1907-deep
```

运行时只使用官方 Codex.app 内签名的 Node.js，通过回环 CDP 注入 CSS 与非交互装饰节点，不修改应用包、`app.asar` 或代码签名。
