export class TFile {}

export class Modal {}
export class ConfirmationModal extends Modal {}
export class ButtonComponent {}
export class Setting {}
export class Plugin {}
export class PluginSettingTab {}
export class SecretComponent {}
export class Notice {}

export async function requestUrl(): Promise<never> {
	throw new Error('requestUrl must be injected in tests');
}

export function getLanguage(): string {
	return 'en';
}

export const moment = {
	locale: (): string => 'en'
};
