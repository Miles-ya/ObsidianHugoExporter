import { App,  Modal, Notice, Plugin, PluginSettingTab, Setting, TFile ,moment} from 'obsidian';
import * as fs from 'fs/promises'
import * as path from 'path';
import * as yaml from 'js-yaml';

// 为图片格式定义一个可复用的常量
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];

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
		this.addRibbonIcon('send', '发布到hugo', (_evt: MouseEvent) => {
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

		try {
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

			await fs.writeFile(destinationPath, processedContent, 'utf-8');

			//图片复制
			await this.copyImages(activeFile,destinationDir );
			new Notice(`${activeFile.name} 同步成功`);
		} catch (error) {
			console.error('Hugo 导出失败:', error);
			new Notice('导出失败，详情请查看开发者控制台。');
		}



	}
	async processMarkdownForHugo(rawContent: string, activeFile: TFile): Promise<string | null> {

		/* ---------- YAML处理 (已优化) ---------- */
		// 使用 Obsidian API 获取元数据，比正则表达式更稳定
		const fileCache = this.app.metadataCache.getFileCache(activeFile);
		
		// 'frontmatter' 可能为 undefined，所以提供一个空对象作为默认值
		// 使用解构赋值来安全地排除 Obsidian API 注入的 'position' 属性
		const { position, ...userFrontmatter } = fileCache?.frontmatter || {};

		// 基于元数据的位置信息，精确地分离出 Markdown 正文
		let markdownContent = rawContent;
		const frontmatterEndOffset = fileCache?.frontmatterPosition?.end.offset;
		if (frontmatterEndOffset) {
			// 从元数据块结束后开始截取，并移除前导空格/换行
			markdownContent = rawContent.substring(frontmatterEndOffset).trim();
		}

		// 定义Hugo必需的默认字段配置 (已优化日期逻辑)
		const hugoDefaults = {
			title: activeFile.basename,
			// 优先使用笔记元数据中的日期，其次是文件修改日期
			date: userFrontmatter.date ? moment(userFrontmatter.date).format() : moment(activeFile.stat.mtime).format(),
			draft: false
		};

		/* ---------- 正文链接处理 (已整合) ---------- */
		// 转换Obsidian的 [[WikiLink]] 和 ![[AttachmentLink]] 为Hugo兼容的Markdown链接
		markdownContent = markdownContent.replace(/!?\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, linkTarget, alias) => {
			// 处理图片链接 `![[...]]`
			if (match.startsWith('!')) {
				const extension = path.extname(linkTarget).toLowerCase();
				if (IMAGE_EXTENSIONS.includes(extension)) {
					const altText = alias || '';
					const imageName = path.basename(linkTarget);
					// 对图片文件名进行URL编码，避免特殊字符问题
					const encodedImageName = encodeURI(imageName);
					return `![${altText}](${encodedImageName})`;
				}
			}
			// 处理普通内部链接 `[[...]]`
			else {
				const displayText = alias || linkTarget;
				// 将链接目标转换为URL友好的slug格式
				// 注意：这个slugify函数比较基础，可能无法完美处理非ASCII字符。
				const slug = linkTarget
					.toLowerCase()
					.trim()
					// 移除非字母、数字、空格和连字符的字符
					.replace(/[^\w\s-]/g, '')
					// 将多个空格或连字符替换为单个连字符
					.replace(/[\s_-]+/g, '-')
					// 移除开头和结尾的连字符
					.replace(/^-+|-+$/g, '');

				// 生成Hugo期望的相对链接格式, 指向另一个Page Bundle
				return `[${displayText}](../${slug}/)`;
			}
			// 如果不是预期的链接格式（例如，带不支持扩展名的附件），保持原样
			return match;
		});


		/* ---------- 合并处理 ---------- */
		// 合并默认配置与用户自定义的前置元数据，用户自定义的会覆盖默认值
		const finalFrontmatter = { ...hugoDefaults, ...userFrontmatter };
		// js-yaml 的 dump 行为可能会在结尾添加换行符
		const finalYamlString = yaml.dump(finalFrontmatter);
		const finalContent = `---\n${finalYamlString}---\n\n${markdownContent}`;

		return finalContent;
	}

async copyImages(activeFile: TFile, destinationDir: string) {
    const fileCache = this.app.metadataCache.getFileCache(activeFile);
    if (!fileCache?.embeds) {
        return;
    }

    const imageEmbeds = fileCache.embeds.filter(embed => {
        // 【新增】安全检查：确保 embed.link 是一个非空字符串
        if (typeof embed.link !== 'string' || !embed.link) {
            return false;
        }
        const extension = path.extname(embed.link).toLowerCase();
        return IMAGE_EXTENSIONS.includes(extension);
    });

    for (const embed of imageEmbeds) {
        const imageFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, activeFile.path);
        if (imageFile instanceof TFile) {
            try {
                const imageBinary = await this.app.vault.readBinary(imageFile);
                const destImagePath = path.join(destinationDir, imageFile.name);
                await fs.writeFile(destImagePath, Buffer.from(imageBinary));
            } catch (e) {
                new Notice(`图片复制失败: ${imageFile.name}`);
                console.error(`Error copying image ${imageFile.name}:`, e);
            }
        } else {
            new Notice(`图片文件未找到: ${embed.link}`);
			console.warn(`Image file not found for link: ${embed.link} in ${activeFile.path}`);
        }
    }
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

