import {
	App,
	Plugin,
	PluginSettingTab,
	SettingDefinitionItem
} from 'obsidian';
import { validateContentPath, validateHugoPath } from './exporter';
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

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: t('setting_hugo_path_name'),
				desc: t('setting_hugo_path_desc'),
				control: {
					type: 'text',
					key: 'hugoPath',
					defaultValue: '',
					validate: value => validateHugoPath(value) ? undefined : t('setting_hugo_path_invalid')
				}
			},
			{
				name: t('setting_content_path_name'),
				desc: t('setting_content_path_desc'),
				control: {
					type: 'text',
					key: 'contentPath',
					defaultValue: 'content/posts',
					validate: value => validateContentPath(value) ? undefined : t('setting_content_path_invalid')
				}
			},
			{
				name: t('setting_replacements_name'),
				desc: t('setting_replacements_desc')
			},
			{
				type: 'list',
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
		this.update();
	}

	private async addReplacementRule(): Promise<void> {
		this.exporter.settings.replacementRules.push({ from: '', to: '' });
		await this.exporter.saveSettings();
		this.update();
	}
}
