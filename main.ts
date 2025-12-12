import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, moment } from 'obsidian';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { t } from 'src/i18n';

// 支持的图片文件扩展名
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];

/**
 * 插件设置接口，定义了Hugo路径和内容路径
 */
interface ObsidianHugoExporterSettings {
	hugoPath: string;
	contentPath: string;
}

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: ObsidianHugoExporterSettings = {
	hugoPath: '',
	contentPath: 'content/posts'
};

export default class ObsidianHugoExporter extends Plugin {
	settings: ObsidianHugoExporterSettings;

	/**
	 * 插件加载时执行
	 */
	async onload() {
		// 加载保存的设置
		await this.loadSettings();

		console.debug(`ObsidianHugoExporter: Using language: ${moment.locale()}`);

		// 添加功能区图标（Ribbon Icon）
		this.addRibbonIcon('send', t('ribbon_tool_tip'), (_evt: MouseEvent) => {
			// 点击图标时执行导出当前文件
			void this.exportCurrentFile();
		});

		// 添加设置面板
		this.addSettingTab(new ObsidianHugoExporterSettingTab(this.app, this));
	}

	/**
	 * 导出当前活动文件到Hugo
	 */
	async exportCurrentFile() {
		// 检查Hugo路径是否已配置
		if (!this.settings.hugoPath) {
			new Notice(t('notice_hugo_path_not_set'));
			return;
		}

		// 获取当前活动的文件
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice(t('notice_no_active_file'));
			return;
		}

		try {
			// 读取文件内容
			const fileContent = await this.app.vault.read(activeFile);

			// 处理Markdown内容，转换为Hugo兼容格式（now synchronous）
			const processedContent = this.processMarkdownForHugo(fileContent, activeFile);
			if (!processedContent) {
				return;
			}

			// 构建目标目录路径
			const destinationDir = path.join(this.settings.hugoPath, this.settings.contentPath, activeFile.basename);
			const destinationPath = path.join(destinationDir, 'index.md');

			console.debug(activeFile.name);

			// 创建目标目录，如果不存在则递归创建
			await fs.mkdir(destinationDir, { recursive: true });

			// 写入处理后的内容到目标文件
			await fs.writeFile(destinationPath, processedContent, 'utf-8');

			// 复制文件中的图片到目标目录
			await this.copyImages(activeFile, destinationDir);

			// 显示成功通知
			new Notice(t('notice_sync_success').replace('{fileName}', activeFile.name));
		} catch (error) {
			console.error('Hugo 导出失败:', error);
			new Notice(t('notice_export_fail'));
		}
	}

	/**
	 * 处理Markdown内容，使其兼容Hugo（synchronous）
	 * @param rawContent 原始Markdown内容
	 * @param activeFile 当前活动文件
	 * @returns 处理后的Markdown内容
	 */
	processMarkdownForHugo(rawContent: string, activeFile: TFile): string | null {
		const fileCache = this.app.metadataCache.getFileCache(activeFile);

		// 提取用户自定义的Frontmatter，并排除 'position' 字段（显式忽略）
		const userFrontmatter = { ...(fileCache?.frontmatter || {}) };
		delete userFrontmatter.position;

		let markdownContent = rawContent;
		const frontmatterEndOffset = fileCache?.frontmatterPosition?.end.offset;
		if (frontmatterEndOffset) {
			markdownContent = rawContent.substring(frontmatterEndOffset).trim();
		}

		const hugoDefaults = {
			title: activeFile.basename,
			date: userFrontmatter.date
				? moment(userFrontmatter.date).format()
				: moment(activeFile.stat.mtime).format(),
			draft: false
		};

		// 替换Obsidian内部链接为Hugo兼容的链接
		markdownContent = markdownContent.replace(/!?\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, linkTarget, alias) => {
			if (match.startsWith('!')) {
				const extension = path.extname(linkTarget).toLowerCase();
				if (IMAGE_EXTENSIONS.includes(extension)) {
					const altText = alias || '';
					const imageName = path.basename(linkTarget);
					const encodedImageName = encodeURI(imageName);
					return `[${altText}](${encodedImageName})`;
				}
			} else {
				const displayText = alias || linkTarget;
				return `[${displayText}](../${encodeURI(displayText)}/)`;
			}
			return match;
		});

		const finalFrontmatter = { ...hugoDefaults, ...userFrontmatter };
		const finalYamlString = yaml.dump(finalFrontmatter);
		const finalContent = `---\n${finalYamlString}---\n\n${markdownContent}`;

		return finalContent;
	}

	/**
	 * 复制当前文件中的嵌入图片到Hugo目标目录
	 * @param activeFile 当前活动文件
	 * @param destinationDir Hugo内容的图片目标目录
	 */
	async copyImages(activeFile: TFile, destinationDir: string) {
		const fileCache = this.app.metadataCache.getFileCache(activeFile);
		if (!fileCache?.embeds) {
			return;
		}

		const imageEmbeds = fileCache.embeds.filter(embed => {
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
					new Notice(t('notice_copy_image_fail').replace('{imageName}', imageFile.name));
					console.error(`Error copying image ${imageFile.name}:`, e);
				}
			} else {
				new Notice(t('notice_image_not_found').replace('{imageLink}', embed.link));
				console.warn(`Image file not found for link: ${embed.link} in ${activeFile.path}`);
			}
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/**
 * 插件设置面板
 */
class ObsidianHugoExporterSettingTab extends PluginSettingTab {
	plugin: ObsidianHugoExporter;

	constructor(app: App, plugin: ObsidianHugoExporter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 使用 Setting.setHeading() 替代直接创建 h2
		new Setting(containerEl)
			.setName(t('setting_title'))
			.setHeading();

		// Hugo 路径设置项
		new Setting(containerEl)
			.setName(t('setting_hugo_path_name'))
			.setDesc(t('setting_hugo_path_desc'))
			.addText(text =>
				text
					.setPlaceholder('')
					.setValue(this.plugin.settings.hugoPath)
					.onChange(async value => {
						this.plugin.settings.hugoPath = value;
						await this.plugin.saveSettings();
					})
			);

		// 文章目录设置项
		new Setting(containerEl)
			.setName(t('setting_content_path_name'))
			.setDesc(t('setting_content_path_desc'))
			.addText(text =>
				text
					.setPlaceholder('content/posts')
					.setValue(this.plugin.settings.contentPath)
					.onChange(async value => {
						this.plugin.settings.contentPath = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
