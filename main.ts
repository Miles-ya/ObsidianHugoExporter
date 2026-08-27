import { Notice, Plugin, TFile } from 'obsidian';
import { InvalidExportNameError } from './src/export-note';
import type { ExportResult } from './src/export-note';
import { ExportPathError } from './src/exporter';
import { runExportWorkflow } from './src/export-workflow';
import { t } from './src/i18n';
import {
	DEFAULT_SETTINGS,
	ObsidianHugoExporterSettings,
	ObsidianHugoExporterSettingTab
} from './src/settings';

interface AppSettingsController {
	setting?: {
		open(): void;
		openTabById(id: string): void;
	};
}

export default class ObsidianHugoExporter extends Plugin {
	settings!: ObsidianHugoExporterSettings;
	private exportInProgress = false;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('send', t('ribbon_tool_tip'), () => {
			void this.exportCurrentFile();
		});

		this.addSettingTab(new ObsidianHugoExporterSettingTab(this.app, this));
	}

	async exportCurrentFile(): Promise<void> {
		if (this.exportInProgress) {
			new Notice(t('notice_export_in_progress'));
			return;
		}
		if (!this.settings.hugoPath) {
			new Notice(t('notice_hugo_path_not_set'));
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice(t('notice_no_active_file'));
			return;
		}

		this.exportInProgress = true;
		try {
			await this.exportFile(activeFile);
		} catch (error) {
			console.error('Hugo export failed:', error);
			if (error instanceof ExportPathError) {
				new Notice(t(error.code === 'invalid-hugo-path'
					? 'notice_invalid_hugo_path'
					: 'notice_invalid_content_path'));
			} else if (error instanceof InvalidExportNameError) {
				new Notice(t('notice_invalid_export_name').replace('{fileName}', error.fileName));
			} else {
				new Notice(t('notice_export_fail'));
			}
		} finally {
			this.exportInProgress = false;
		}
	}

	private async exportFile(activeFile: TFile): Promise<void> {
		const result = await runExportWorkflow(this.app, activeFile, this.settings, {
			openSettings: () => this.openPluginSettings()
		});
		if (result) this.showExportResult(activeFile, result);
	}

	private openPluginSettings(): void {
		const controller = (this.app as unknown as AppSettingsController).setting;
		if (!controller) {
			new Notice(t('notice_open_settings_manually'));
			return;
		}
		controller.open();
		controller.openTabById(this.manifest.id);
	}

	private showExportResult(activeFile: TFile, result: ExportResult): void {
		for (const warning of result.warnings) {
			if (warning.type === 'missing-image') {
				new Notice(t('notice_image_not_found').replace('{imageLink}', warning.value));
				console.warn(`Image file not found for link: ${warning.value} in ${activeFile.path}`);
			} else {
				new Notice(t('notice_copy_image_fail').replace('{imageName}', warning.value));
				console.error(`Unable to read image: ${warning.value}`);
			}
		}

		const cleanedCount = result.metadataReports.filter(report => report.status === 'cleaned').length;
		new Notice(
			t('notice_sync_success')
				.replace('{fileName}', activeFile.name)
				.replace('{directoryName}', result.directoryName)
				.replace('{cleanedCount}', String(cleanedCount))
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
