<div align="center">
  <img src="src/assets/icon.svg" width="80" height="80" alt="E-Hentai Bridger 标志">
  <h1>E-Hentai Bridger</h1>
  <p><strong>让 E 站浏览更顺手。</strong></p>
  <p>面向 Chrome / Edge 的轻量扩展，增强 E-Hentai / ExHentai 的日常浏览体验。</p>
  <p>
    <a href="#安装与更新">安装</a> ·
    <a href="#开始使用">使用</a> ·
    <a href="#目录结构">目录结构</a> ·
    <a href="#开发与验证">开发</a>
  </p>
  <p>
    <a href="https://github.com/01Petard/E-Hentai-Bridger">GitHub</a> ·
    <a href="https://github.com/01Petard/E-Hentai-Fetcher">Gallery Lens（联动工具）</a>
  </p>
</div>

## 项目定位

E-Hentai Bridger 围绕 E-Hentai / ExHentai 的实际使用场景，为源站页面提供轻量的体验增强与快捷操作，减少浏览中的重复步骤，让常用操作更顺手。

Gallery Lens 快捷跳转是当前已实现的一项增强功能。后续功能同样以改善 E 站浏览体验为出发点，按实际需求逐步完善。

## 当前功能：Gallery Lens 快捷入口

- 在 E-Hentai / ExHentai 页面右上角显示项目图标快捷按钮。
- 画廊页跳转到 Gallery Lens 详情页，其他页面传入 Gallery Lens 首页。
- 完整保留当前源站 URL，包括搜索条件与分页参数。
- 在新标签页打开目标，保留当前页面；支持 Tab、Enter 与空格操作。

当前版本 **1.0.0**。快捷入口的目标实例为 [Gallery Lens](https://e-gallery.bugstack.top/)。

## 安装与更新

### 直接安装发布包

1. 获取 `release/e-hentai-bridger-1.0.0.zip`，解压到一个长期保留的目录。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`，开启「开发者模式」。
3. 选择「加载已解压的扩展」，加载**解压后直接包含 `manifest.json` 的目录**。
4. 刷新已打开的 E-Hentai / ExHentai 页面。

使用发布包不需要 Node.js 或 pnpm；浏览器不能通过此安装方式直接加载 ZIP。

### 从源码安装

准备 **Node.js 24+、pnpm 10.34.6**，在项目目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run verify
```

随后按上面的浏览器步骤加载本项目的 **`dist/`**。项目根目录、`src/` 和 `public/` 用于开发，均不是完整安装目录。

更新源码后重新构建，再在扩展管理页点击 E-Hentai Bridger 的「重新加载」，最后刷新源站页面。此前从项目根目录安装的版本，请移除旧条目并改为加载 `dist/`。

详细步骤及常见问题见[安装与更新引导](doc/INSTALL.md)。

## 开始使用

扩展只在 `https://e-hentai.org/*` 和 `https://exhentai.org/*` 的顶层页面工作。图标按钮固定在右上角，距顶部、右侧各 16px，尺寸为 36×36px；默认半透明，悬停或通过键盘聚焦时恢复不透明，悬停提示保留完整用途说明。

| 源站页面 | 按钮行为 |
| --- | --- |
| 两个源站的纯首页 | 直接打开 `https://e-gallery.bugstack.top/` |
| 路径以 `/g/` 开头 | 打开 `https://e-gallery.bugstack.top/gallery?url=...` |
| 搜索、上传者及其他页面 | 打开 `https://e-gallery.bugstack.top/?url=...` |

带搜索参数的首页可以跳转。完整源站 URL 通过 `encodeURIComponent` 编码一次，不切换 E-Hentai / ExHentai 域名。

扩展根据当前地址生成链接，不读取或传递 Cookie、账号信息，不包含后台服务或工具栏操作面板。

**接收端限制：**计划阶段核对的 Gallery Lens 首页只接收上传者形式的 `url` 参数，普通搜索地址可能不会自动恢复查询。扩展仍会完整传递约定链接；接收端适配另行处理。

## 目录结构

```text
E-hentai Bridger/
├── src/
│   ├── content/index.js       # 内容脚本源码：地址判断、按钮、跳转
│   └── assets/icon.svg        # E 字形与桥形扩展图标
├── public/manifest.json       # 扩展名称、版本与站点匹配配置
├── scripts/
│   ├── build.mjs              # 清理构建、监听源码变更
│   ├── validate-release.mjs   # 检查安装目录、版本和运行文件
│   └── package-release.mjs    # 生成带版本号的 ZIP
├── tests/
│   ├── bridger.test.cjs       # 跳转规则与站点限制
│   ├── release.test.mjs       # 构建、发布校验和 ZIP 内容
│   └── browser.mjs            # 加载 dist 的浏览器验收
├── doc/
│   ├── INSTALL.md             # 安装、更新、卸载与排错
│   ├── DEVELOPMENT.md         # 环境、命令与开发流程
│   └── verification.md        # 验证结果与边界
├── dist/                     # 构建生成；浏览器加载此目录
│   ├── manifest.json
│   ├── content.js
│   └── icons/                # 构建生成的 16 / 32 / 48 / 128px PNG
├── release/                  # 打包生成；ZIP 内直接包含运行文件
│   └── e-hentai-bridger-1.0.0.zip
├── output/playwright/        # 浏览器验证结果与截图
├── .nvmrc                    # Node.js 24
├── package.json
└── pnpm-lock.yaml
```

`dist/`、`release/`、`output/` 和 `node_modules/` 均为生成目录，不进入版本管理。ZIP 仅打包 `dist/` 的运行文件。

## 开发与验证

```sh
pnpm run dev           # 首次构建，并监听源码与 Manifest 变更
pnpm run lint          # 内容脚本语法检查
pnpm test              # Node 内置测试
pnpm run build         # 生成干净的 dist/
pnpm run verify        # 语法、测试、构建和发布目录检查
pnpm run package       # 完整验证后生成 release/*.zip
```

开发时在浏览器加载 `dist/`，保存文件后等待终端显示 `Built dist/`，再重新加载扩展并刷新源站。`dev` 是文件监听构建，不启动网页预览服务器，也不会自动刷新浏览器。

真实浏览器测试使用独立临时配置，加载实际 `dist/`，在匹配域名下返回受控 HTML：

```sh
pnpm exec playwright install chromium
pnpm run test:browser
```

完整环境准备、Edge 验证及版本更新流程见[开发引导](doc/DEVELOPMENT.md)。验证范围见[验证记录](doc/verification.md)。
