// 从 'obsidian' 模块导入所有需要的类和类型，这些是开发插件的基础
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile ,moment} from 'obsidian';
import * as fs from 'fs/promises'
import * as path from 'path';
import * as yaml from 'js-yaml';
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

	}

	//总
	async exportCurrentFile(){
		if (!this.settings.hugoPath) {
			new Notice('请先在插件设置中配置 Hugo 路径');
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('没有活动的笔记文件');
			return;
		}

		const fileContent = await this.app.vault.read(activeFile);

		//调用md格式处理函数，包括两个部分，一个是处理YAML元数据，一个是处理链接格式
		const processedContent = await this.processMarkdownForHugo(fileContent, activeFile);

		if (!processedContent) {
			return;
		}

		const destinationDir = path.join(this.settings.hugoPath,this.settings.contentPath,activeFile.basename);
		const destinationPath = path.join(destinationDir, 'index.md');
		console.log(activeFile.name);
		await fs.mkdir(destinationDir, { recursive: true });
		new Notice(`${activeFile.name} 同步成功`);
		await fs.writeFile(destinationPath, processedContent, 'utf-8');
	}

	/**
 * 处理Markdown内容以适配Hugo格式要求
 * 该函数会解析并处理YAML前置元数据，并确保包含Hugo必需的默认字段
 *
 * @param rawContent - 原始的Markdown文件内容字符串
 * @param activeFile - 当前处理的文件对象，用于获取文件基本信息
 * @returns 处理后的符合Hugo格式的Markdown内容字符串，如果处理失败则返回null
 */
	async processMarkdownForHugo(rawContent: string, activeFile: TFile): Promise<string | null> {

		/* ---------- YMAL处理 ---------- */
		// 使用正则表达式匹配YAML前置元数据部分
		const frontmatterRegex = /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]/;
		const match = rawContent.match(frontmatterRegex);

		let frontmatter: any = {};
		let markdownContent = rawContent;

		// 如果找到前置元数据，则解析YAML内容
		if (match) {
			const ymalString = match[1];
			try {
				frontmatter = yaml.load(ymalString)||{};
			} catch (e){
				new Notice('YAML Frontmatter 格式错误，无法解析。');
				console.error('YAML parsing error:', e);
				return null;
			}
			// 提取去除前置元数据后的Markdown正文内容
			markdownContent = rawContent.substring(match[0].length);
		}

		// 定义Hugo必需的默认字段配置
		const hugoDefaults = {
			title: activeFile.basename,
			date: moment().format(),
			draft: false
		}


		/* ---------- 正文链接处理 ---------- */
		markdownContent = markdownContent.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, linkTarget, alias) =>{

			const displayText = alias || linkTarget;
			// const encodedLinkTarget = encodeURI(linkTarget);
			return `[${displayText}](${linkTarget})`;
		});


		/* ---------- 合并处理 ---------- */
		// 合并默认配置与用户自定义的前置元数据
		const finalFrontmatter = { ...hugoDefaults, ...frontmatter };
		const finalYamlString = yaml.dump(finalFrontmatter);
		const finalContent = `---\n${finalYamlString}---\n\n${markdownContent}`;

		return finalContent;
	}




	onunload() {
		// 这个方法是可选的，如果你的插件在 onload 中手动创建了一些需要清理的东西，可以在这里处理
	}

	async loadSettings() {
		// this.loadData() 会异步加载 data.json 文件
		// Object.assign 用于合并对象，这里用默认设置来填充加载后不存在的设置项
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

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

