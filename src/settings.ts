import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { t } from './i18n';

export interface ReplacementRule {
	from: string;
	to: string;
}

export interface ObsidianHugoExporterSettings {
	hugoPath: string;
	contentPath: string;
	replacementRules: ReplacementRule[];
}

export const DEFAULT_SETTINGS: ObsidianHugoExporterSettings = {
	hugoPath: '',
	contentPath: 'content/posts',
	replacementRules: []
};

interface SettingsHost extends Plugin {
	settings: ObsidianHugoExporterSettings;
	saveSettings(): Promise<void>;
}

export class ObsidianHugoExporterSettingTab extends PluginSettingTab {
	private readonly exporter: SettingsHost;

	constructor(app: App, plugin: SettingsHost) {
		super(app, plugin);
		this.exporter = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('setting_title'))
			.setHeading();

		new Setting(containerEl)
			.setName(t('setting_hugo_path_name'))
			.setDesc(t('setting_hugo_path_desc'))
			.addText(text =>
				text
					.setPlaceholder('')
					.setValue(this.exporter.settings.hugoPath)
					.onChange(async value => {
						this.exporter.settings.hugoPath = value;
						await this.exporter.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t('setting_content_path_name'))
			.setDesc(t('setting_content_path_desc'))
			.addText(text =>
				text
					.setPlaceholder('content/posts')
					.setValue(this.exporter.settings.contentPath)
					.onChange(async value => {
						this.exporter.settings.contentPath = value;
						await this.exporter.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t('setting_replacements_name'))
			.setDesc(t('setting_replacements_desc'))
			.setHeading();

		this.exporter.settings.replacementRules.forEach((rule, index) => {
			new Setting(containerEl)
				.setName(t('setting_replacement_rule').replace('{number}', String(index + 1)))
				.addText(text =>
					text
						.setPlaceholder(t('setting_replacement_from'))
						.setValue(rule.from)
						.onChange(async value => {
							rule.from = value;
							await this.exporter.saveSettings();
						})
				)
				.addText(text =>
					text
						.setPlaceholder(t('setting_replacement_to'))
						.setValue(rule.to)
						.onChange(async value => {
							rule.to = value;
							await this.exporter.saveSettings();
						})
				)
				.addButton(button =>
					button
						.setButtonText(t('setting_replacement_remove'))
						.onClick(async () => {
							this.exporter.settings.replacementRules.splice(index, 1);
							await this.exporter.saveSettings();
							this.display();
						})
				);
		});

		new Setting(containerEl)
			.addButton(button =>
				button
					.setButtonText(t('setting_replacement_add'))
					.onClick(async () => {
						this.exporter.settings.replacementRules.push({ from: '', to: '' });
						await this.exporter.saveSettings();
						this.display();
					})
			);
	}
}
