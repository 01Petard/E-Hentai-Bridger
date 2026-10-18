# 开发引导

## 环境准备

与 FocusMask 使用相同的工具版本约定：Node.js 24+、pnpm 10.34.6。项目通过 `.nvmrc` 指定 Node.js 24，通过 `packageManager` 固定 pnpm，仅维护 `pnpm-lock.yaml`。

```sh
# 使用 nvm 时，在项目目录切换 Node；其他安装方式直接准备 Node.js 24+
nvm install
nvm use

# 如果尚未安装指定 pnpm
npm install --global pnpm@10.34.6

node --version
pnpm --version
pnpm install --frozen-lockfile
```

扩展运行时只有原生 JavaScript；`sharp` 将 SVG 源图标导出为四种尺寸的 PNG，`fflate` 用于打包，Playwright 用于浏览器验证。这些开发依赖不会进入安装目录或 ZIP。

## 日常开发

1. 执行 `pnpm run dev`，完成首次构建并保持文件监听。
2. 按[安装引导](INSTALL.md)在浏览器加载 `dist/`。
3. 修改 `src/content/index.js` 中的按钮与跳转逻辑，或 `public/manifest.json` 中的扩展配置。
4. 保存后等待终端输出 `Built dist/`，然后在扩展管理页重新加载扩展，刷新源站。
5. 结束开发时用 `Ctrl+C` 停止监听。

图标源文件为 `src/assets/icon.svg`，使用深绿色背景、奶白色 E 字形与珊瑚色桥形。E 字形已转为路径，不依赖构建机器上的字体；修改 SVG 后，构建会自动生成 `dist/icons/` 中的四种 PNG。

`dev` 监听 `src/`、`public/` 和 `package.json`。修改测试或脚本后需自行重新执行相应命令。构建会重建 `dist/`，请修改源码，不要直接修改生成文件。

## 命令与产物

| 命令 | 用途 | 输出 |
| --- | --- | --- |
| `pnpm run dev` | 初次构建并监听变更 | 持续更新 `dist/` |
| `pnpm run lint` | 原生内容脚本语法检查 | 终端结果；不做格式重写 |
| `pnpm test` | 跳转规则与发布流程回归 | 终端测试结果 |
| `pnpm run build` | 清理并构建安装目录 | `dist/` |
| `pnpm run verify` | 语法、测试、构建、发布目录校验 | 可加载的 `dist/` |
| `pnpm run test:browser` | 构建后加载真实扩展进行浏览器验证 | `output/playwright/` |
| `pnpm run package` | 完整验证后打包 | `release/e-hentai-bridger-<版本>.zip` |

`verify` 检查 Manifest 与项目版本一致、站点范围没有扩大、没有新增权限、运行文件与当前源码一致，且安装目录中仅存在运行文件。测试还会解压 ZIP，逐文件比对 `dist/`。

## 浏览器验证

默认使用 Playwright 配套 Chromium，显示独立测试浏览器窗口：

```sh
pnpm exec playwright install chromium
pnpm run test:browser
```

无界面模式：

```sh
BRIDGER_HEADED=0 pnpm run test:browser
```

macOS Edge 示例，其他系统将可执行文件路径替换为本机路径：

```sh
BRIDGER_TEST_LABEL=edge BRIDGER_HEADED=0 \
BRIDGER_BROWSER_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
pnpm run test:browser
```

这些环境变量写法适用于 macOS / Linux；Windows PowerShell 请通过 `$env:变量名 = '值'` 设置。

测试使用临时浏览器配置，通过浏览器级 `Extensions.loadUnpacked` 加载实际 `dist/`，不修改用户日常浏览器配置和发布 Manifest。需使用支持该调试接口的近期 Chromium / Edge；手工安装扩展无需此接口。

测试在两个源站域名及其他对照域名下返回受控 HTML，检查真实注入、样式隔离、紧凑尺寸、默认半透明与悬停/键盘聚焦状态、首页跳转、新标签页 URL 和站点限制。**不访问真实源站内容，不验证账号、网络可达性或 Gallery Lens 接收端查询业务。**结果保存为 `results-chromium.json` 或 `results-edge.json`，截图保存为 `button-<标签>.png` 和 `button-idle-<标签>.png`；测试结束自动关闭浏览器并清理临时配置。

## 版本与打包

1. 同时更新 `package.json`、`public/manifest.json` 的版本，并同步 README 中的示例版本。
2. 安装依赖后执行 `pnpm run package`。
3. 需要检查浏览器交互时，另行执行 `pnpm run test:browser`；浏览器测试不包含在常规 `verify` 中。
4. 分发 `release/e-hentai-bridger-<版本>.zip`，或将 `dist/` 用作本地安装目录。

ZIP 根目录直接包含 `manifest.json`、`content.js` 和 `icons/`，解压后即可加载。打包不会上传扩展商店或执行外部发布。
