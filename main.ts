import { Notice, Plugin, TFile } from 'obsidian';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { claimExportDirectory } from './src/exporter';
import { prepareImages } from './src/images';
import { t } from './src/i18n';
import {
	DEFAULT_SETTINGS,
	ObsidianHugoExporterSettings,
	ObsidianHugoExporterSettingTab
} from './src/settings';
import {
	applyReplacements,
	convertWikiLinks,
	findMarkdownBodyOffset,
	formatExportDate,
	isSafeExportName,
	replaceStringValues,
	stripDatePrefix,
	transformBodyWithImages
} from './src/transform';

export default class ObsidianHugoExporter extends Plugin {
	settings: ObsidianHugoExporterSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('send', t('ribbon_tool_tip'), () => {
			void this.exportCurrentFile();
		});

		this.addSettingTab(new ObsidianHugoExporterSettingTab(this.app, this));
	}

	async exportCurrentFile(): Promise<void> {
		if (!this.settings.hugoPath) {
			new Notice(t('notice_hugo_path_not_set'));
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice(t('notice_no_active_file'));
			return;
		}

		try {
			await this.exportFile(activeFile);
		} catch (error) {
			console.error('Hugo export failed:', error);
			new Notice(t('notice_export_fail'));
		}
	}

	private async exportFile(activeFile: TFile): Promise<void> {
		const rawContent = await this.app.vault.read(activeFile);
		const fileCache = this.app.metadataCache.getFileCache(activeFile);
		const rules = this.settings.replacementRules;
		const cleanedTitle = stripDatePrefix(activeFile.basename);
		const exportBaseName = applyReplacements(cleanedTitle, rules).trim();

		if (!isSafeExportName(exportBaseName)) {
			new Notice(t('notice_invalid_export_name').replace('{fileName}', exportBaseName || activeFile.basename));
			return;
		}

		const preparedImages = await prepareImages(this.app, activeFile, fileCache?.embeds || [], rules);
		for (const imageLink of preparedImages.missingLinks) {
			new Notice(t('notice_image_not_found').replace('{imageLink}', imageLink));
			console.warn(`Image file not found for link: ${imageLink} in ${activeFile.path}`);
		}
		for (const imageName of preparedImages.failedImages) {
			new Notice(t('notice_copy_image_fail').replace('{imageName}', imageName));
			console.error(`Unable to read image: ${imageName}`);
		}

		const parentDirectory = join(this.settings.hugoPath, this.settings.contentPath);
		const claimedDirectory = await claimExportDirectory(parentDirectory, exportBaseName);
		const frontmatterEndOffset = findMarkdownBodyOffset(rawContent);
		let markdownContent = transformBodyWithImages(
			rawContent,
			frontmatterEndOffset,
			preparedImages.replacements,
			rules
		);
		markdownContent = convertWikiLinks(markdownContent);

		const userFrontmatter: Record<string, unknown> = { ...(fileCache?.frontmatter || {}) };
		delete userFrontmatter.position;
		const frontmatter = replaceStringValues({
			title: cleanedTitle,
			date: formatExportDate(userFrontmatter.date, activeFile.stat.mtime),
			draft: false,
			...userFrontmatter
		}, rules) as Record<string, unknown>;

		if (claimedDirectory.suffix > 0) {
			const effectiveTitle = typeof frontmatter.title === 'string'
				? frontmatter.title
				: exportBaseName;
			frontmatter.title = `${effectiveTitle}${claimedDirectory.suffix}`;
		}

		const finalContent = `---\n${stringifyYaml(frontmatter)}---\n\n${markdownContent}`;
		await writeFile(join(claimedDirectory.directoryPath, 'index.md'), finalContent, 'utf-8');

		for (const image of preparedImages.assets) {
			await writeFile(
				join(claimedDirectory.directoryPath, image.outputName),
				Buffer.from(image.data)
			);
		}

		new Notice(
			t('notice_sync_success')
				.replace('{fileName}', activeFile.name)
				.replace('{directoryName}', claimedDirectory.directoryName)
		);
	}

	async loadSettings(): Promise<void> {
		const stored = await this.loadData() as Partial<ObsidianHugoExporterSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored || {});
		if (!Array.isArray(this.settings.replacementRules)) {
			this.settings.replacementRules = [];
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
