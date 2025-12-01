// 从 'obsidian' 模块导入所有需要的类和类型，这些是开发插件的基础
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import * as fs from 'fs/promises'
import * as path from 'path';
import {indexOf} from "builtin-modules";

// 定义插件设置的接口（Interface）
interface ObsidianHugoExporterSettings {
	hugoPath: string;
	contentPath: string;

}

// 定义默认设置
// 当用户第一次安装插件，或者设置文件损坏时，会使用这些默认值
const DEFAULT_SETTINGS: ObsidianHugoExporterSettings = {
	hugoPath: '',
	contentPath: 'content/posts'
}

/**
 * 主要的插件类，所有插件逻辑的入口点。
 * 类名需要是唯一的，并且需要继承自 Plugin 基类。
 */
export default class ObsidianHugoExporter extends Plugin {
	// 用于存放插件设置的属性
	settings: ObsidianHugoExporterSettings;

    /**
     * 这是插件生命周期的一部分，当插件被启用时，这个方法会自动执行。
     * 所有初始化的代码都应该放在这里。
     */
	async onload() {

		// 加载插件的设置数据。
		await this.loadSettings();

		// 在 Obsidian 左侧边栏添加一个 Ribbon 图标（快捷按钮）
		const ribbonIconEl = this.addRibbonIcon('send', '发布到hugo', (_evt: MouseEvent) => {
			this.exportCurrentFile();
		});

		// 为插件添加一个设置页面（Tab）
		this.addSettingTab(new ObsidianHugoExporterSettingTab(this.app, this));





		// // 在 Obsidian 窗口底部的状态栏添加一个新的项目
		// // 注意：这个功能在移动端 App 上不生效
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('状态栏文本'); // 设置状态栏项目显示的文本

		// // 添加一个命令到命令面板 (通过 Ctrl/Cmd + P 打开)
		// // 这是一个简单的命令
		// this.addCommand({
		// 	id: 'open-sample-modal-simple', // 命令的唯一ID
		// 	name: '打开示例模态框（简单）', // 命令在命令面板中显示的名字
		// 	callback: () => {
		// 		// 命令被触发时执行的回调函数
		// 		new SampleModal(this.app).open(); // 创建并打开一个新的模态框
		// 	}
		// });

		// // 添加一个“编辑器命令”，这种命令通常需要和编辑器交互
		// this.addCommand({
		// 	id: 'sample-editor-command', // 命令的唯一ID
		// 	name: '示例编辑器命令', // 命令的名字
		// 	// editorCallback 只在用户正在编辑一个 Markdown 文件时才有效
		// 	editorCallback: (editor: Editor, _view: MarkdownView) => {
		// 		console.log(editor.getSelection()); // 在控制台打印当前选中的文本
		// 		editor.replaceSelection('示例编辑器命令'); // 将当前选中的文本替换为指定内容
		// 	}
		// });

		// // 添加一个更复杂的命令，它包含一个检查条件
		// this.addCommand({
		// 	id: 'open-sample-modal-complex', // 命令的唯一ID
		// 	name: '打开示例模态框（复杂）', // 命令的名字
		// 	// checkCallback 会在决定是否执行命令前回被调用
		// 	checkCallback: (checking: boolean) => {
		// 		// 检查当前是否有活跃的 Markdown 视图
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// 如果 `checking` 是 true, 表示 Obsidian 只是在检查这个命令当前是否可用
		// 			// 这种情况下，我们不应该执行任何操作，只返回 true 或 false
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}
		//
		// 			// 返回 true 表示该命令当前可用，它会显示在命令面板中
		// 			return true;
		// 		}
		// 		// 如果没有活跃的 Markdown 视图，返回 false，命令将不会显示
		// 		return false;
		// 	}
		// });

		// // 注册一个全局的 DOM 事件监听器
		// // 这个方法的好处是，当插件被禁用时，Obsidian 会自动帮你移除这个监听器，防止内存泄漏
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt); // 每次点击 document 时，在控制台打印事件对象
		// });

		// // 注册一个定时器
		// // 和 registerDomEvent 类似，这个定时器会在插件禁用时自动被清除
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000)); // 每5分钟在控制台打印一次 'setInterval'
	}

	async exportCurrentFile(){
		if (!this.settings['hugoPath']) {
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return;
		}

		const fileContent = await this.app.vault.read(activeFile);

		const destinationDir = path.join(this.settings.hugoPath, 'content', 'posts',activeFile.basename);
		const destinationPath = path.join(destinationDir, 'index.md');
		console.log(activeFile.name);
		await fs.mkdir(destinationDir, { recursive: true });
		new Notice(`${activeFile.name} 同步成功`);
		await fs.writeFile(destinationPath, fileContent, 'utf-8');
	}



	/**
     * 这是插件生命周期的另一部分，当插件被禁用时，这个方法会自动执行。
     * 所有清理工作的代码都应该放在这里，比如移除添加的元素、清除定时器等。
	 * （Obsidian 会自动处理通过 this.add... 和 this.register... 添加的内容）
     */
	onunload() {
		// 这个方法是可选的，如果你的插件在 onload 中手动创建了一些需要清理的东西，可以在这里处理
	}

    /**
     * 异步方法，用于加载插件的设置
     */
	async loadSettings() {
		// this.loadData() 会异步加载 data.json 文件
		// Object.assign 用于合并对象，这里用默认设置来填充加载后不存在的设置项
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

    /**
     * 异步方法，用于保存插件的设置
     */
	async saveSettings() {
		// this.saveData() 会将传入的对象（这里是 this.settings）保存到 data.json 文件
		await this.saveData(this.settings);
	}
}

/**
 * 定义一个模态框（Modal）类，继承自 Obsidian 的 Modal 基类
 */
class SampleModal extends Modal {
	// 构造函数，接收一个 App 实例
	constructor(app: App) {
		super(app);
	}

    /**
     * 当模态框被打开时调用的生命周期方法
     */
	onOpen() {
		const {contentEl} = this; // contentEl 是模态框内容的 HTML 容器
		contentEl.setText('哇!'); // 在模态框中显示文本
	}

    /**
     * 当模态框被关闭时调用的生命周期方法
     */
	onClose() {
		const {contentEl} = this; // 获取内容容器
		contentEl.empty(); // 清空容器中的所有内容，防止内存泄漏
	}
}


/**
 * 定义插件的设置页面（Tab）类，继承自 PluginSettingTab 基类
 */
class ObsidianHugoExporterSettingTab extends PluginSettingTab {
	plugin: ObsidianHugoExporter; // 用于引用主插件实例

	// 构造函数
	constructor(app: App, plugin: ObsidianHugoExporter) {
		super(app, plugin);
		this.plugin = plugin;
	}

    /**
     * `display` 方法用于构建设置页面的 HTML 内容
     */
	display(): void {
		const {containerEl} = this; // containerEl 是设置页面的根 HTML 容器

		// 在重新绘制设置页面前，先清空所有内容，防止重复
		containerEl.empty();
		containerEl.createEl('h2',  { text: 'ObsidianHugoExporter设置' });


		new Setting(containerEl)
			.setName('Hugo 路径') // 设置项的标题
			.setDesc('Hugo 项目的路径（注意要用左斜杠‘/’）') // 设置项的描述
			.addText(text => text // 添加一个文本输入框
				.setPlaceholder('') // 设置输入框的占位符
				.setValue(this.plugin.settings.hugoPath) // 将输入框的值与插件设置关联
				.onChange(async (value) => { // 当输入框内容改变时触发的回调
					this.plugin.settings.hugoPath = value; // 更新插件设置对象中的值
					await this.plugin.saveSettings(); // 保存设置到文件
				})
			);

		new Setting(containerEl)
			.setName('文章目录') // 设置项的标题
			.setDesc('Hugo 文章目录的路径') // 设置项的描述
			.addText(text => text // 添加一个文本输入框
				.setPlaceholder('content/posts') // 设置输入框的占位符
				.setValue(this.plugin.settings.contentPath) // 将输入框的值与插件设置关联
				.onChange(async (value) => { // 当输入框内容改变时触发的回调
					this.plugin.settings.contentPath = value; // 更新插件设置对象中的值
					await this.plugin.saveSettings(); // 保存设置到文件
				})
			);

	}
}

