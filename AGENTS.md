# Obsidian 社区插件

## 项目概述

- 目标：Obsidian 社区插件（TypeScript → 打包的 JavaScript）。
- 入口点：`main.ts` 编译为 `main.js` 并由 Obsidian 加载。
- 所需发布工件：`main.js`、`manifest.json` 和可选的 `styles.css`。

## 环境与工具

- Node.js：使用当前的 LTS 版本（建议 Node 18+）。
- **包管理器：npm**（此示例需要 - `package.json` 定义了 npm 脚本和依赖项）。
- **打包器：esbuild**（此示例需要 - `esbuild.config.mjs` 和构建脚本依赖于它）。其他打包器如 Rollup 或 webpack 也适用于其他项目，如果它们将所有外部依赖项打包到 `main.js` 中。
- 类型：`obsidian` 类型定义。

**注意**：此示例项目在技术上依赖于 npm 和 esbuild。如果您是从头开始创建插件，可以选择不同的工具，但需要相应地替换构建配置。

### 安装

```bash
npm install
```

### 开发 (watch)

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

## 代码检查

- 要使用 eslint，请从终端安装 eslint：`npm install -g eslint`
- 要使用 eslint 分析此项目，请使用以下命令：`eslint main.ts`
- eslint 将创建一份报告，其中包含按文件和行号改进代码的建议。
- 如果您的源代码位于文件夹中，例如 `src`，您可以使用此命令分析该文件夹中的所有文件：`eslint ./src/`

## 文件和文件夹约定

- **将代码组织到多个文件中**：将功能拆分到单独的模块中，而不是将所有内容都放在 `main.ts` 中。
- 源代码位于 `src/` 中。保持 `main.ts` 小巧，专注于插件生命周期（加载、卸载、注册命令）。
- **示例文件结构**：
  ```
  src/
    main.ts           # 插件入口点，生命周期管理
    settings.ts       # 设置界面和默认值
    commands/         # 命令实现
      command1.ts
      command2.ts
    ui/              # UI 组件、模态框、视图
      modal.ts
      view.ts
    utils/           # 实用函数、辅助函数
      helpers.ts
      constants.ts
    types.ts         # TypeScript 接口和类型
  ```
- **不要提交构建工件**：永远不要将 `node_modules/`、`main.js` 或其他生成的文件提交到版本控制中。
- 保持插件小巧。避免大型依赖项。首选浏览器兼容的包。
- 生成的输出应放在插件根目录或 `dist/` 中，具体取决于您的构建设置。发布工件必须最终位于存储库中插件文件夹的顶层（`main.js`、`manifest.json`、`styles.css`）。

## 清单规则 (`manifest.json`)

- 必须包含（非详尽）：  
  - `id`（插件 ID；对于本地开发，它应该与文件夹名称匹配）  
  - `name`  
  - `version`（语义版本控制 `x.y.z`）  
  - `minAppVersion`  
  - `description`  
  - `isDesktopOnly`（布尔值）  
  - 可选：`author`、`authorUrl`、`fundingUrl`（字符串或映射）
- 发布后永远不要更改 `id`。将其视为稳定的 API。
- 使用较新的 API 时，请保持 `minAppVersion` 准确。
- 规范要求在此处编码：https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## 测试

- 手动安装测试：将 `main.js`、`manifest.json`、`styles.css`（如果存在）复制到：
  ```
  <Vault>/.obsidian/plugins/<plugin-id>/
  ```
- 重新加载 Obsidian 并在 **设置 → 社区插件** 中启用插件。

## 命令与设置

- 所有面向用户的命令都应通过 `this.addCommand(...)` 添加。
- 如果插件有配置，请提供一个设置选项卡和合理的默认值。
- 使用 `this.loadData()` / `this.saveData()` 保存设置。
- 使用稳定的命令 ID；发布后避免重命名。

## 版本控制与发布

- 在 `manifest.json` 中更新 `version`（SemVer），并更新 `versions.json` 以映射插件版本 → 最低应用程序版本。
- 创建一个 GitHub 版本，其标签与 `manifest.json` 的 `version` 完全匹配。不要使用前导 `v`。
- 将 `manifest.json`、`main.js` 和 `styles.css`（如果存在）作为单独的资产附加到版本中。
- 初次发布后，根据需要按照流程在社区目录中添加/更新您的插件。

## 安全、隐私和合规性

遵循 Obsidian 的**开发者政策**和**插件指南**。特别是：

- 默认为本地/离线操作。仅在功能必要时才发出网络请求。
- 没有隐藏的遥测。如果您收集可选分析或调用第三方服务，则需要明确选择加入，并在 `README.md` 和设置中清晰地记录。
- 除了正常发布之外，绝不执行远程代码、获取和评估脚本或自动更新插件代码。
- 最小化范围：只读/写库中必要的内容。不要访问库外部的文件。
- 清晰披露所使用的任何外部服务、发送的数据和风险。
- 尊重用户隐私。除非绝对必要并明确同意，否则不要收集库内容、文件名或个人信息。
- 避免欺骗性模式、广告或垃圾通知。
- 使用提供的 `register*` 助手注册并清理所有 DOM、应用程序和间隔监听器，以便插件安全卸载。

## 用户体验和文案指南（针对 UI 文本、命令、设置）

- 标题、按钮和标题首选句子大小写。
- 在分步文案中使用清晰、面向行动的祈使句。
- 使用**粗体**表示文字 UI 标签。交互首选“选择”。
- 导航使用箭头表示法：**设置 → 社区插件**。
- 保持应用程序内字符串简短、一致且没有行话。

## 性能

- 保持启动轻量。将繁重的工作推迟到需要时。
- 避免在 `onload` 期间执行长时间运行的任务；使用延迟初始化。
- 批量磁盘访问并避免过多的存储库扫描。
- 对文件系统事件的响应中，对昂贵的操作进行去抖动/节流。

## 编码约定

- 首选 TypeScript，并开启 `"strict": true`。
- **保持 `main.ts` 最小化**：仅关注插件生命周期（onload, onunload, addCommand 调用）。将所有功能逻辑委托给单独的模块。
- **拆分大文件**：如果任何文件超过约 200-300 行，请考虑将其拆分为更小、更集中的模块。
- **使用清晰的模块边界**：每个文件应具有单一的、明确定义的职责。
- 将所有内容打包到 `main.js` 中（没有未打包的运行时依赖项）。
- 如果您希望移动兼容性，请避免使用 Node/Electron API；相应地设置 `isDesktopOnly`。
- 首选 `async/await` 而不是 promise 链；优雅地处理错误。

## 移动

- 在可行的情况下，在 iOS 和 Android 上进行测试。
- 除非 `isDesktopOnly` 为 `true`，否则不要假定仅限桌面行为。
- 避免大型内存结构；注意内存和存储限制。

## 代理应该/不应该做什么

**应该**
- 添加具有稳定 ID 的命令（发布后不要重命名）。
- 在设置中提供默认值和验证。
- 编写幂等代码路径，以便重新加载/卸载不会泄漏监听器或间隔。
- 为所有需要清理的项使用 `this.register*` 辅助函数。

**不应该**
- 在没有明确的用户可见原因和文档的情况下引入网络调用。
- 在没有明确披露和明确选择加入的情况下，发布需要云服务的功能。
- 存储或传输库内容，除非必要并经同意。

## 常见任务

### 跨多个文件组织代码

**main.ts**（最小化，仅限生命周期）：
```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
  settings: MySettings;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    registerCommands(this);
  }
}
```

**settings.ts**：
```ts
export interface MySettings {
  enabled: boolean;
  apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
  enabled: true,
  apiKey: "",
};
```

**commands/index.ts**：
```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
  plugin.addCommand({
    id: "do-something",
    name: "做一些事情",
    callback: () => doSomething(plugin),
  });
}
```

### 添加命令

```ts
this.addCommand({
  id: "your-command-id",
  name: "执行操作",
  callback: () => this.doTheThing(),
});
```

### 持久化设置

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### 安全注册监听器

```ts
this.registerEvent(this.app.workspace.on("file-open", f => { /* ... */ }));
this.registerDomEvent(window, "resize", () => { /* ... */ });
this.registerInterval(window.setInterval(() => { /* ... */ }, 1000));
```

## 故障排除

- 构建后插件未加载：确保 `main.js` 和 `manifest.json` 位于 `<Vault>/.obsidian/plugins/<plugin-id>/` 下插件文件夹的顶层。
- 构建问题：如果 `main.js` 缺失，运行 `npm run build` 或 `npm run dev` 来编译您的 TypeScript 源代码。
- 命令未出现：验证 `addCommand` 在 `onload` 之后运行，并且 ID 是唯一的。
- 设置未持久化：确保 `loadData`/`saveData` 被等待，并且您在更改后重新渲染 UI。
- 仅限移动设备的问题：确认您没有使用仅限桌面设备的 API；检查 `isDesktopOnly` 并进行调整。

## 参考

- Obsidian 示例插件：https://github.com/obsidianmd/obsidian-sample-plugin
- API 文档：https://docs.obsidian.md
- 开发者政策：https://docs.obsidian.md/Developer+policies
- 插件指南：https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- 样式指南：https://help.obsidian.md/style-guide
