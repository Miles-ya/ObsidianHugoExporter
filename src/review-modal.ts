import {
	App,
	ButtonComponent,
	ConfirmationModal,
	Modal,
	Setting
} from 'obsidian';
import type { ReviewIssue } from './ai-review';
import type { MetadataReport } from './metadata-cleaner';
import {
	validateReviewFixes
} from './review-fixes';
import type { ReviewFixSelections } from './review-fixes';
import { t } from './i18n';

export interface ReviewDecision {
	selections: ReviewFixSelections;
}

export type ErrorAction = 'retry' | 'settings' | 'cancel';
export type ExportStage = 'prepare' | 'metadata' | 'review';

function confirmAction(app: App, title: string, message: string, confirmText: string): Promise<boolean> {
	return new Promise(resolve => {
		let settled = false;
		const modal = new ConfirmationModal(app);
		modal.setTitle(title);
		modal.contentEl.createEl('p', { text: message });
		modal.addButton(button => button
			.setButtonText(confirmText)
			.setDestructive()
			.setCta()
			.onClick(() => {
				settled = true;
				resolve(true);
			}));
		modal.addCancelButton(t('button_back'));
		modal.setCloseCallback(() => {
			if (!settled) resolve(false);
		});
		modal.open();
	});
}

export async function confirmDisableAiReview(app: App): Promise<boolean> {
	return confirmAction(
		app,
		t('confirm_disable_ai_title'),
		t('confirm_disable_ai_desc'),
		t('confirm_disable_ai_action')
	);
}

export class ExportProgressModal extends Modal {
	private stageEl: HTMLElement | null = null;
	private active = true;
	private cancelledByUser = false;
	private resolveCancellation!: () => void;
	readonly cancelled = new Promise<void>(resolve => {
		this.resolveCancellation = resolve;
	});

	onOpen(): void {
		this.setTitle(t('review_progress_title'));
		this.stageEl = this.contentEl.createEl('p');
		this.setStage('prepare');
		new ButtonComponent(this.contentEl)
			.setButtonText(t('button_cancel'))
			.onClick(() => this.close());
	}

	setStage(stage: ExportStage): void {
		this.stageEl?.setText(t(`review_stage_${stage}`));
	}

	finish(): void {
		this.active = false;
		this.close();
	}

	wasCancelled(): boolean {
		return this.cancelledByUser;
	}

	onClose(): void {
		if (this.active) {
			this.active = false;
			this.cancelledByUser = true;
			this.resolveCancellation();
		}
		this.contentEl.empty();
	}
}

class ReviewModal extends Modal {
	private settled = false;
	private readonly selections: ReviewFixSelections = {};
	private resolveDecision!: (decision: ReviewDecision | null) => void;
	readonly decision = new Promise<ReviewDecision | null>(resolve => {
		this.resolveDecision = resolve;
	});

	constructor(
		app: App,
		private readonly fileName: string,
		private readonly markdown: string,
		private readonly issues: ReviewIssue[],
		private readonly metadataReports: MetadataReport[]
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(t('review_title'));
		const blockingCount = this.issues.filter(issue => issue.level === 'blocking').length;
		const warningCount = this.issues.length - blockingCount;
		this.contentEl.createEl('p', {
			text: t('review_summary')
				.replace('{fileName}', this.fileName)
				.replace('{blocking}', String(blockingCount))
				.replace('{warnings}', String(warningCount))
		});
		this.contentEl.createEl('p', { text: t('review_copy_only') });

		for (const issue of this.issues) {
			this.renderIssue(issue);
		}
		this.renderMetadataReports();

		const errorEl = this.contentEl.createEl('p');
		const footer = this.contentEl.createDiv();
		new ButtonComponent(footer)
			.setButtonText(t('button_cancel'))
			.onClick(() => this.close());
		new ButtonComponent(footer)
			.setButtonText(t('review_export_action'))
			.setCta()
			.onClick(async () => {
				errorEl.empty();
				const validationError = validateReviewFixes(this.markdown, this.issues, this.selections);
				if (validationError) {
					errorEl.setText(t(`review_fix_error_${validationError.code}`));
					return;
				}

				const unresolvedWarnings = this.issues.some(issue =>
					issue.level === 'warning' && !this.selections[issue.id]?.selected
				);
				if (unresolvedWarnings && !await confirmAction(
					this.app,
					t('review_warning_confirm_title'),
					t('review_warning_confirm_desc'),
					t('review_warning_confirm_action')
				)) return;

				const metadataFailed = this.metadataReports.some(report => report.status === 'failed');
				if (metadataFailed && !await confirmAction(
					this.app,
					t('metadata_failure_confirm_title'),
					t('metadata_failure_confirm_desc'),
					t('metadata_failure_confirm_action')
				)) return;

				this.settled = true;
				this.resolveDecision({ selections: this.selections });
				this.close();
			});
	}

	private renderIssue(issue: ReviewIssue): void {
		this.contentEl.createEl('hr');
		const prefix = issue.level === 'blocking'
			? t('review_level_blocking')
			: t('review_level_warning');
		this.contentEl.createEl('h3', { text: `${prefix} ${issue.title}` });
		this.contentEl.createEl('p', { text: issue.reason });
		this.contentEl.createEl('pre', { text: issue.exactText });
		this.selections[issue.id] = {
			selected: false,
			replacement: issue.suggestedReplacement
		};

		let replacementInput: HTMLTextAreaElement | null = null;
		new Setting(this.contentEl)
			.setName(t('review_apply_fix'))
			.addToggle(toggle => toggle
				.setValue(false)
				.onChange(value => {
					this.selections[issue.id].selected = value;
					if (replacementInput) replacementInput.disabled = !value;
				}));
		new Setting(this.contentEl)
			.setName(t('review_replacement'))
			.addTextArea(textarea => {
				replacementInput = textarea.inputEl;
				textarea.inputEl.disabled = true;
				textarea
					.setValue(issue.suggestedReplacement)
					.onChange(value => {
						this.selections[issue.id].replacement = value;
					});
			});
	}

	private renderMetadataReports(): void {
		if (this.metadataReports.length === 0) return;
		this.contentEl.createEl('hr');
		this.contentEl.createEl('h3', { text: t('metadata_report_title') });
		const list = this.contentEl.createEl('ul');
		for (const report of this.metadataReports) {
			const removed = report.removedTypes.length > 0
				? report.removedTypes.join(', ')
				: t('metadata_none_removed');
			const key = report.status === 'failed'
				? 'metadata_failed_item'
				: report.status === 'cleaned'
					? 'metadata_cleaned_item'
					: 'metadata_unchanged_item';
			list.createEl('li', {
				text: t(key)
					.replace('{imageName}', report.imageName)
					.replace('{metadata}', removed)
			});
		}
	}

	onClose(): void {
		if (!this.settled) this.resolveDecision(null);
		this.contentEl.empty();
	}
}

export function showReviewModal(
	app: App,
	fileName: string,
	markdown: string,
	issues: ReviewIssue[],
	metadataReports: MetadataReport[]
): Promise<ReviewDecision | null> {
	const modal = new ReviewModal(app, fileName, markdown, issues, metadataReports);
	modal.open();
	return modal.decision;
}

export function showReviewError(app: App, message: string): Promise<ErrorAction> {
	return new Promise(resolve => {
		let settled = false;
		const modal = new ConfirmationModal(app);
		modal.setTitle(t('review_error_title'));
		modal.contentEl.createEl('p', { text: message });
		modal.addButton(button => button
			.setButtonText(t('button_retry'))
			.setCta()
			.onClick(() => {
				settled = true;
				resolve('retry');
			}));
		modal.addButton(button => button
			.setButtonText(t('button_open_settings'))
			.setSecondary()
			.onClick(() => {
				settled = true;
				resolve('settings');
			}));
		modal.addCancelButton(t('button_cancel'));
		modal.setCloseCallback(() => {
			if (!settled) resolve('cancel');
		});
		modal.open();
	});
}
