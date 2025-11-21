import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// 记得重命名这些类和接口!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: '默认'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// 这会在左侧边栏中创建一个图标。
		const ribbonIconEl = this.addRibbonIcon('dice', '示例插件', (_evt: MouseEvent) => {
			// 当用户点击图标时调用。
			new Notice('这是一个通知！');
		});
		// 对功能区执行其他操作
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// 这会在应用程序底部添加一个状态栏项目。在移动应用程序上不起作用。
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('状态栏文本');

		// 这添加了一个可以随处触发的简单命令
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: '打开示例模态框（简单）',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// 这添加了一个编辑器命令，可以对当前编辑器实例执行某些操作
		this.addCommand({
			id: 'sample-editor-command',
			name: '示例编辑器命令',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('示例编辑器命令');
			}
		});
		// 这添加了一个复杂的命令，可以检查应用程序的当前状态是否允许执行该命令
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: '打开示例模态框（复杂）',
			checkCallback: (checking: boolean) => {
				// 要检查的条件
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// 如果 checking 为 true，我们只是“检查”命令是否可以运行。
					// 如果 checking 为 false，那么我们希望实际执行该操作。
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// 仅当检查函数返回 true 时，此命令才会显示在命令面板中
					return true;
				}
			}
		});

		// 这会添加一个设置选项卡，以便用户可以配置插件的各个方面
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// 如果插件挂接了任何全局 DOM 事件（在不属于此插件的应用程序部分）
		// 使用此函数将在禁用此插件时自动删除事件侦听器。
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// 注册间隔时，此函数将在禁用插件时自动清除间隔。
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('哇!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('设置 #1')
			.setDesc('这是一个秘密')
			.addText(text => text
				.setPlaceholder('输入你的秘密')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}

