import {
	App,
	Plugin,
	PluginSettingTab,
	requireApiVersion,
	Setting,
	SettingDefinitionItem
} from 'obsidian';
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
		this.renderLegacySettings();
	}

	private renderLegacySettings(): void {
		const { containerEl } = this;
		containerEl.empty();

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
					.setPlaceholder('')
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
							this.renderLegacySettings();
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
						this.renderLegacySettings();
					})
			);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: t('setting_hugo_path_name'),
				desc: t('setting_hugo_path_desc'),
				control: {
					type: 'text',
					key: 'hugoPath',
					defaultValue: ''
				}
			},
			{
				name: t('setting_content_path_name'),
				desc: t('setting_content_path_desc'),
				control: {
					type: 'text',
					key: 'contentPath',
					defaultValue: 'content/posts'
				}
			},
			{
				type: 'list',
				heading: t('setting_replacements_name'),
				emptyState: t('setting_replacements_empty'),
				items: this.exporter.settings.replacementRules.map((rule, index) => ({
					name: t('setting_replacement_rule').replace('{number}', String(index + 1)),
					render: setting => {
						setting
							.addText(text => text
								.setPlaceholder(t('setting_replacement_from'))
								.setValue(rule.from)
								.onChange(async value => {
									rule.from = value;
									await this.exporter.saveSettings();
								}))
							.addText(text => text
								.setPlaceholder(t('setting_replacement_to'))
								.setValue(rule.to)
								.onChange(async value => {
									rule.to = value;
									await this.exporter.saveSettings();
								}));
					}
				})),
				onDelete: index => {
					void this.deleteReplacementRule(index);
				},
				addItem: {
					name: t('setting_replacement_add'),
					action: () => {
						void this.addReplacementRule();
					}
				}
			}
		];
	}

	private async deleteReplacementRule(index: number): Promise<void> {
		this.exporter.settings.replacementRules.splice(index, 1);
		await this.exporter.saveSettings();
		if (requireApiVersion('1.13.0')) {
			this.update();
		}
	}

	private async addReplacementRule(): Promise<void> {
		this.exporter.settings.replacementRules.push({ from: '', to: '' });
		await this.exporter.saveSettings();
		if (requireApiVersion('1.13.0')) {
			this.update();
		}
	}
}
