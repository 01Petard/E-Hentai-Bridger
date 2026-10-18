# 1.0.0 验证记录

验证日期：2026-10-18。环境：macOS arm64、Node.js 24.11.0、pnpm 10.34.6。

本轮按 FocusMask 的源码、安装目录和发布包分层方式整理工程，并为扩展接入图标。图标源文件为 `src/assets/icon.svg`，延续 Gallery Lens 的配色与 E 字形，加入桥形；构建自动生成四种尺寸的 PNG，跳转规则保持不变。

## 已验证

| 检查 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | 通过，锁文件与依赖一致 |
| `pnpm run verify` / `pnpm run package` | 通过：语法检查、46 项 Node 测试、构建、发布目录校验 |
| `dev` 文件监听 | 在独立源码副本中验证首次构建、修改 SVG 后自动重新生成 PNG、停止进程 |
| Playwright 配套 Chromium 156.0.8078.4 | 加载实际 `dist/`，14 项浏览器检查通过 |
| Microsoft Edge 155.0.4283.60 | 加载实际 `dist/`，14 项浏览器检查通过 |
| ZIP 解压比对 | 使用 Python 标准库独立检查，6 个文件与 `dist/` 逐字节一致 |

Node 测试覆盖跳转与禁用规则、站点限制、当前地址读取、重复注入、清理构建、非项目工作目录运行脚本、过期产物与多余文件拒绝、权限及版本变化检查、版本化 ZIP 内容，以及四种 PNG 的格式、尺寸、透明通道、缺失图标和错误尺寸拒绝。

浏览器检查覆盖真实扩展注入、外部网页 CSS 下的样式隔离、右上角 16px 定位、Tab/Enter/空格操作、新标签页路径、URL 完整还原、原标签页保留、无 opener/referrer、首页禁用、非允许站点不注入，以及扩展图标资源在浏览器中的加载与解码。测试使用独立临时浏览器配置，结束后自动清理；不修改发布 Manifest。

## 安装产物

- 本地安装：`dist/`，包含 `manifest.json`、`content.js` 和 `icons/` 中的 16、32、48、128px PNG。
- 发布包：`release/gallery-lens-bridger-1.0.0.zip`，7,034 字节；ZIP 包含六个运行文件。
- SHA-256：`b6f7bee48f5b2c9fc5eeed2329a1c67427af55910ec0cceda0a259ff77246cfb`。

浏览器结果位于 `output/playwright/results-chromium.json` 和 `results-edge.json`，截图位于同目录的 `button-chromium.png`、`button-edge.png`；文件监听检查结果位于 `output/dev-watch.json`。这些记录不进入安装目录或 ZIP。

## 验证边界

浏览器使用两个源站域名及对照域名下的受控 HTML 响应，验证扩展实际加载和导航行为；没有访问真实源站内容，也没有验证账号、网络可达性或 Gallery Lens 的查询业务。普通搜索 URL 的接收端限制仍需在 Gallery Lens 项目中另行处理。

未执行浏览器商店上传、商店安装或正式发布。用户日常浏览器中的原生扩展管理页安装流程，请按[安装引导](INSTALL.md)操作；本轮自动化加载使用浏览器调试接口。
