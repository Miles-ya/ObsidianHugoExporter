import { App,  Modal, Notice, Plugin, PluginSettingTab, Setting, TFile ,moment} from 'obsidian';
import * as fs from 'fs/promises'
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
}

export default class ObsidianHugoExporter extends Plugin {
	settings: ObsidianHugoExporterSettings;

	/**
	 * 插件加载时执行
	 */
	async onload() {
		// 加载保存的设置
		await this.loadSettings();

		console.log(`ObsidianHugoExporter: Using language: ${moment.locale()}`);

		// 添加功能区图标（Ribbon Icon）
		this.addRibbonIcon('send', t('ribbon_tool_tip'), (_evt: MouseEvent) => {
			// 点击图标时执行导出当前文件
			this.exportCurrentFile();
		});

		// 添加设置面板
		this.addSettingTab(new ObsidianHugoExporterSettingTab(this.app, this));

	}

		/**

		 * 导出当前活动文件到Hugo

		 */

		async exportCurrentFile(){

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

				// 处理Markdown内容，转换为Hugo兼容格式
				const processedContent = await this.processMarkdownForHugo(fileContent, activeFile);

				if (!processedContent) {

					return;

				}

	

				// 构建目标目录路径

				const destinationDir = path.join(this.settings.hugoPath,this.settings.contentPath,activeFile.basename);

				// 构建目标文件路径（index.md）

				const destinationPath = path.join(destinationDir, 'index.md');

				console.log(activeFile.name);

				// 创建目标目录，如果不存在则递归创建

				await fs.mkdir(destinationDir, { recursive: true });

	

				// 写入处理后的内容到目标文件

				await fs.writeFile(destinationPath, processedContent, 'utf-8');

	

				// 复制文件中的图片到目标目录

				await this.copyImages(activeFile,destinationDir );

				// 显示成功通知

				new Notice(t('notice_sync_success').replace('{fileName}', activeFile.name));

			} catch (error) {

				// 捕获并处理导出过程中的错误

				console.error('Hugo 导出失败:', error);
				new Notice(t('notice_export_fail'));
			}
		}
	/**
	 * 处理Markdown内容，使其兼容Hugo
	 * @param rawContent 原始Markdown内容
	 * @param activeFile 当前活动文件
	 * @returns 处理后的Markdown内容
	 */
	async processMarkdownForHugo(rawContent: string, activeFile: TFile): Promise<string | null> {
		// 获取文件的元数据缓存
		const fileCache = this.app.metadataCache.getFileCache(activeFile);

		// 提取用户自定义的Frontmatter，并排除 'position' 字段
		const { position, ...userFrontmatter } = fileCache?.frontmatter || {};

		let markdownContent = rawContent;
		// 获取Frontmatter结束的位置
		const frontmatterEndOffset = fileCache?.frontmatterPosition?.end.offset;
		// 如果存在Frontmatter，则从其结束位置开始截取Markdown内容
		if (frontmatterEndOffset) {
			markdownContent = rawContent.substring(frontmatterEndOffset).trim();
		}

		// 定义Hugo默认的Frontmatter字段
		const hugoDefaults = {
			title: activeFile.basename, // 标题使用文件名
			date: userFrontmatter.date ? moment(userFrontmatter.date).format() : moment(activeFile.stat.mtime).format(), // 日期优先使用用户定义，否则使用文件修改日期
			draft: false // 默认为非草稿
		};

		// 替换Obsidian内部链接为Hugo兼容的链接
		markdownContent = markdownContent.replace(/!?\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, linkTarget, alias) => {
			// 如果是图片链接（以 '!' 开头）
			if (match.startsWith('!')) {
				const extension = path.extname(linkTarget).toLowerCase();
				// 检查是否是支持的图片扩展名
				if (IMAGE_EXTENSIONS.includes(extension)) {
					const altText = alias || ''; // 使用别名作为alt文本，如果没有则为空
					const imageName = path.basename(linkTarget); // 获取图片文件名
					const encodedImageName = encodeURI(imageName); // 对图片名进行URI编码
					return `![${altText}](${encodedImageName})`; // 返回Hugo图片格式
				}
			}
			// 如果是普通Markdown链接
			else {
				const displayText = alias || linkTarget; // 显示文本优先使用别名
				// 生成slug（URL友好的字符串）
				// const slug = linkTarget
				// 	.toLowerCase()
				// 	.trim()
				// 	.replace(/[^\w\s-]/g, '') // 移除特殊字符
				// 	.replace(/[\s_-]+/g, '-') // 替换空格和下划线为连字符
				// 	.replace(/^-+|-+$/g, ''); // 移除开头和结尾的连字符
				//
				// return `[${displayText}](../${slug}/)`; // 返回Hugo链接格式
				return `[${displayText}](../${encodeURI(displayText)}/)`;
			}
			return match; // 不匹配的链接原样返回
		});

		// 合并最终的Frontmatter：用户自定义的覆盖默认的
		const finalFrontmatter = { ...hugoDefaults, ...userFrontmatter };
		// 将Frontmatter对象转换为YAML字符串
		const finalYamlString = yaml.dump(finalFrontmatter);
		// 组合最终内容：YAML Frontmatter + Markdown内容
		const finalContent = `---\n${finalYamlString}---\n\n${markdownContent}`;

		return finalContent;
	}

	/**
	 * 复制当前文件中的嵌入图片到Hugo目标目录
	 * @param activeFile 当前活动文件
	 * @param destinationDir Hugo内容的图片目标目录
	 */
	async copyImages(activeFile: TFile, destinationDir: string) {
    	// 获取文件缓存中的嵌入链接
		const fileCache = this.app.metadataCache.getFileCache(activeFile);
		// 如果没有嵌入链接，则直接返回
    	if (!fileCache?.embeds) {
        	return;
    	}

    	// 过滤出图片嵌入链接
    	const imageEmbeds = fileCache.embeds.filter(embed => {
        	// 确保链接是字符串且不为空
			if (typeof embed.link !== 'string' || !embed.link) {
            	return false;
        	}
        	// 检查图片扩展名是否在支持列表中
        	const extension = path.extname(embed.link).toLowerCase();
        	return IMAGE_EXTENSIONS.includes(extension);
    	});

    	// 遍历所有图片嵌入链接并复制
    	for (const embed of imageEmbeds) {
			// 获取图片文件对象
        	const imageFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, activeFile.path);
        	if (imageFile instanceof TFile) {
            	try {
					// 读取图片二进制内容
                	const imageBinary = await this.app.vault.readBinary(imageFile);
					// 构建目标图片路径
                	const destImagePath = path.join(destinationDir, imageFile.name);
					// 写入图片到目标路径
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

	/**
	 * 插件卸载时执行
	 */
	onunload() {

	}

	/**
	 * 加载插件设置
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * 保存插件设置
	 */
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



	/**
	 * 显示设置面板内容
	 */

	display(): void {

		const {containerEl} = this;

		containerEl.empty(); // 清空设置面板

		containerEl.createEl('h2',  { text: t('setting_title') }); // 添加标题


		// Hugo 路径设置项

		new Setting(containerEl)

			.setName(t('setting_hugo_path_name')) // 设置项名称

			.setDesc(t('setting_hugo_path_desc')) // 设置项描述

			.addText(text => text

				.setPlaceholder('') // 占位符

				.setValue(this.plugin.settings.hugoPath) // 绑定当前设置值

				.onChange(async (value) => { // 值改变时的回调

					this.plugin.settings.hugoPath = value;

					await this.plugin.saveSettings(); // 保存设置

				})

			);


		// 文章目录设置项

		new Setting(containerEl)

			.setName(t('setting_content_path_name')) // 设置项名称

			.setDesc(t('setting_content_path_desc')) // 设置项描述

			.addText(text => text

				.setPlaceholder('content/posts') // 占位符

				.setValue(this.plugin.settings.contentPath) // 绑定当前设置值

				.onChange(async (value) => { // 值改变时的回调

					this.plugin.settings.contentPath = value;

					await this.plugin.saveSettings(); // 保存设置

				})
			);
	}
}
