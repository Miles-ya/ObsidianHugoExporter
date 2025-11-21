# Obsidian 示例插件

这是 Obsidian (https://obsidian.md) 的一个示例插件。

该项目使用 TypeScript 提供类型检查和文档。
该仓库依赖于最新插件 API (obsidian.d.ts) 的 TypeScript 定义格式，其中包含描述其功能的 TSDoc 注释。

这个示例插件演示了插件 API 可以实现的一些基本功能。
- 添加一个功能区图标，单击时会显示一个通知。
- 添加一个命令“打开示例模态框”，该命令会打开一个模态框。
- 在设置页面添加一个插件设置选项卡。
- 注册一个全局单击事件，并将“click”输出到控制台。
- 注册一个全局间隔，该间隔会将“setInterval”记录到控制台。

## 第一次开发插件？

新插件开发人员的快速入门指南：

- 检查是否[已经有人为您想要的功能开发了插件](https://obsidian.md/plugins)！可能有一个现有的插件足够相似，您可以与之合作。
- 使用“Use this template”按钮（如果看不到，请登录 GitHub）将此仓库复制为模板。
- 将您的仓库克隆到本地开发文件夹。为方便起见，您可以将此文件夹放在您的 `.obsidian/plugins/your-plugin-name` 文件夹中。
- 安装 NodeJS，然后在您的仓库文件夹下的命令行中运行 `npm i`。
- 运行 `npm run dev` 将您的插件从 `main.ts` 编译为 `main.js`。
- 对 `main.ts` 进行更改（或创建新的 `.ts` 文件）。这些更改应自动编译到 `main.js` 中。
- 重新加载 Obsidian 以加载您的插件的新版本。
- 在设置窗口中启用插件。
- 要更新 Obsidian API，请在您的仓库文件夹下的命令行中运行 `npm update`。

## 发布新版本

- 使用您的新版本号（例如 `1.0.1`）和最新版本所需的最低 Obsidian 版本更新您的 `manifest.json`。
- 使用 `"new-plugin-version": "minimum-obsidian-version"` 更新您的 `versions.json` 文件，以便旧版本的 Obsidian 可以下载与您的插件兼容的旧版本。
- 使用您的新版本号作为“标签版本”创建新的 GitHub 版本。请使用确切的版本号，不要包含前缀 `v`。有关示例，请参见此处：https://github.com/obsidianmd/obsidian-sample-plugin/releases
- 上传 `manifest.json`、`main.js`、`styles.css` 文件作为二进制附件。注意：manifest.json 文件必须在两个地方，首先是您存储库的根路径，其次是在版本中。
- 发布版本。

> 您可以通过在 `manifest.json` 中手动更新 `minAppVersion` 后运行 `npm version patch`、`npm version minor` 或 `npm version major` 来简化版本升级过程。
> 该命令将升级 `manifest.json` 和 `package.json` 中的版本，并将新版本的条目添加到 `versions.json`

## 将您的插件添加到社区插件列表

- 查看[插件指南](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)。
- 发布初始版本。
- 确保您的仓库根目录中有一个 `README.md` 文件。
- 在 https://github.com/obsidianmd/obsidian-releases 上创建一个拉取请求以添加您的插件。

## 如何使用

- 克隆此仓库。
- 确保您的 NodeJS 版本至少为 v16 (`node --version`)。
- 运行 `npm i` 或 `yarn` 安装依赖项。
- 运行 `npm run dev` 以在监视模式下开始编译。

## 手动安装插件

- 将 `main.js`、`styles.css`、`manifest.json` 复制到您的保险库 `VaultFolder/.obsidian/plugins/your-plugin-id/`。

## 使用 eslint 提高代码质量（可选）
- [ESLint](https://eslint.org/) 是一个分析您的代码以快速发现问题的工具。您可以对您的插件运行 ESLint 以发现常见的错误和改进代码的方法。
- 要在此项目中使用 eslint，请确保从终端安装 eslint：
  - `npm install -g eslint`
- 要使用 eslint 分析此项目，请使用以下命令：
  - `eslint main.ts`
  - 然后 eslint 将创建一份报告，其中包含按文件和行号改进代码的建议。
- 如果您的源代码位于文件夹中，例如 `src`，您可以使用此命令使用 eslint 分析该文件夹中的所有文件：
  - `eslint ./src/`

## 资金链接

您可以包含资金链接，使用您插件的人可以通过这些链接为您提供资金支持。

简单的方法是在您的 `manifest.json` 文件中将 `fundingUrl` 字段设置为您的链接：

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

如果您有多个 URL，您也可以这样做：

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

## API 文档

请参阅 https://github.com/obsidianmd/obsidian-api
