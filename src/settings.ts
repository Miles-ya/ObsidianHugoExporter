import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	SecretComponent
} from 'obsidian';
import type { Setting, SettingDefinitionItem } from 'obsidian';
import { getAiReviewErrorCode, testAiConnection } from './ai-review';
import { validateContentPath, validateHugoPath } from './exporter';
import { t } from './i18n';
import { confirmDisableAiReview } from './review-modal';

export interface ReplacementRule {
	from: string;
	to: string;
}

export interface ObsidianHugoExporterSettings {
	hugoPath: string;
	contentPath: string;
	replacementRules: ReplacementRule[];
	aiReviewEnabled: boolean;
	aiBaseUrl: string;
	aiModel: string;
	aiSecretName: string;
}

export const DEFAULT_SETTINGS: ObsidianHugoExporterSettings = {
	hugoPath: '',
	contentPath: 'content/posts',
	replacementRules: [],
	aiReviewEnabled: true,
	aiBaseUrl: 'https://api.openai.com/v1',
	aiModel: '',
	aiSecretName: ''
};

interface SettingsHost extends Plugin {
	settings: ObsidianHugoExporterSettings;
	saveSettings(): Promise<void>;
}

function validateAiBaseUrl(value: string): string | undefined {
	try {
		const url = new URL(value);
		if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return undefined;
	} catch {
		// The localized validation message is returned below.
	}
	return t('setting_ai_base_url_invalid');
}

export async function applySettingControlChange(
	settings: ObsidianHugoExporterSettings,
	key: string,
	value: unknown,
	save: () => Promise<void>,
	confirmDisable: () => Promise<boolean>
): Promise<boolean> {
	if (key === 'aiReviewEnabled' && value === false && settings.aiReviewEnabled) {
		if (!await confirmDisable()) return false;
	}
	const writableSettings = settings as unknown as Record<string, unknown>;
	writableSettings[key] = value;
	await save();
	return true;
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
				type: 'group',
				items: [
					{
						name: t('setting_replacements_name'),
						desc: t('setting_replacements_desc'),
						render: setting => {
							setting.addButton(button => button
								.setButtonText(t('setting_replacement_add'))
								.onClick(() => void this.addReplacementRule()));
						}
					},
					...this.exporter.settings.replacementRules.map((rule, index) => ({
						name: t('setting_replacement_rule').replace('{number}', String(index + 1)),
						render: (setting: Setting) => {
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
									}))
								.addExtraButton(button => button
									.setIcon('trash-2')
									.setTooltip(t('setting_replacement_delete'))
									.onClick(() => void this.deleteReplacementRule(index)));
						}
					}))
				]
			},
			{
				type: 'group',
				heading: t('setting_ai_heading'),
				items: [
					{
						name: t('setting_ai_enabled_name'),
						desc: t('setting_ai_enabled_desc'),
						control: {
							type: 'toggle',
							key: 'aiReviewEnabled',
							defaultValue: true
						}
					},
					{
						name: t('setting_ai_base_url_name'),
						desc: t('setting_ai_base_url_desc'),
						visible: () => this.exporter.settings.aiReviewEnabled,
						control: {
							type: 'text',
							key: 'aiBaseUrl',
							defaultValue: DEFAULT_SETTINGS.aiBaseUrl,
							validate: validateAiBaseUrl
						}
					},
					{
						name: t('setting_ai_secret_name'),
						desc: t('setting_ai_secret_desc'),
						visible: () => this.exporter.settings.aiReviewEnabled,
						render: setting => {
							setting.addComponent(container => new SecretComponent(this.app, container)
								.setValue(this.exporter.settings.aiSecretName)
								.onChange(async value => {
									this.exporter.settings.aiSecretName = value;
									await this.exporter.saveSettings();
								}));
						}
					},
					{
						name: t('setting_ai_model_name'),
						desc: t('setting_ai_model_desc'),
						visible: () => this.exporter.settings.aiReviewEnabled,
						control: {
							type: 'text',
							key: 'aiModel',
							defaultValue: '',
							validate: value => value.trim() ? undefined : t('setting_ai_model_invalid')
						}
					},
					{
						name: t('setting_ai_test_name'),
						desc: t('setting_ai_test_desc'),
						visible: () => this.exporter.settings.aiReviewEnabled,
						render: setting => {
							setting.addButton(button => button
								.setButtonText(t('setting_ai_test_action'))
								.onClick(async () => {
									button.setDisabled(true);
									try {
										await testAiConnection(this.app, this.exporter.settings);
										new Notice(t('setting_ai_test_success'));
									} catch (error) {
										new Notice(t(`review_error_${getAiReviewErrorCode(error)}`));
									} finally {
										button.setDisabled(false);
									}
								}));
						}
					},
					{
						name: t('setting_ai_privacy_name'),
						desc: t('setting_ai_privacy_desc'),
						visible: () => this.exporter.settings.aiReviewEnabled
					}
				]
			}
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const changed = await applySettingControlChange(
			this.exporter.settings,
			key,
			value,
			() => this.exporter.saveSettings(),
			() => confirmDisableAiReview(this.app)
		);
		if (!changed) this.update();
		if (key === 'aiReviewEnabled') this.update();
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
