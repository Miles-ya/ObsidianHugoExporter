import {
	App,
	ButtonComponent,
	ConfirmationModal,
	Modal
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
		this.modalEl.addClass('hugo-exporter-review-modal');
		const blockingCount = this.issues.filter(issue => issue.level === 'blocking').length;
		const warningCount = this.issues.length - blockingCount;
		this.contentEl.createEl('p', {
			text: t('review_summary')
				.replace('{fileName}', this.fileName)
				.replace('{blocking}', String(blockingCount))
				.replace('{warnings}', String(warningCount))
		});
		this.contentEl.createEl('p', { text: t('review_copy_only') });

		if (this.issues.length > 0) this.renderIssuesTable();
		this.renderMetadataReports();

		const errorEl = this.contentEl.createEl('p');
		const footer = this.contentEl.createDiv({ cls: 'hugo-exporter-review-footer' });
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

	private renderIssuesTable(): void {
		const wrapper = this.contentEl.createDiv({ cls: 'hugo-exporter-review-table-wrapper' });
		const table = wrapper.createEl('table', { cls: 'hugo-exporter-review-table' });
		const header = table.createEl('thead').createEl('tr');
		header.createEl('th', { text: t('review_column_issue') });
		header.createEl('th', { text: t('review_column_replacement') });
		header.createEl('th', { text: t('review_column_action') });
		const body = table.createEl('tbody');
		const orderedIssues = [...this.issues].sort((left, right) =>
			(left.level === 'blocking' ? 0 : 1) - (right.level === 'blocking' ? 0 : 1)
		);
		for (const issue of orderedIssues) this.renderIssueRow(body, issue);
	}

	private renderIssueRow(body: HTMLTableSectionElement, issue: ReviewIssue): void {
		const row = body.createEl('tr');
		const prefix = issue.level === 'blocking'
			? t('review_level_blocking')
			: t('review_level_warning');
		const issueCell = row.createEl('td', { attr: { 'data-label': t('review_column_issue') } });
		issueCell.createSpan({
			cls: `hugo-exporter-review-level is-${issue.level}`,
			text: prefix
		});
		issueCell.createEl('strong', { text: issue.title });
		issueCell.createEl('p', { text: issue.reason });
		issueCell.createEl('code', { text: issue.exactText });

		this.selections[issue.id] = {
			selected: false,
			replacement: issue.suggestedReplacement
		};

		const replacementCell = row.createEl('td', {
			attr: { 'data-label': t('review_column_replacement') }
		});
		const replacementInput = replacementCell.createEl('textarea', {
			cls: 'hugo-exporter-review-replacement',
			text: issue.suggestedReplacement
		});
		replacementInput.addEventListener('input', () => {
			this.selections[issue.id].replacement = replacementInput.value;
		});

		const actionCell = row.createEl('td', {
			cls: 'hugo-exporter-review-actions',
			attr: { 'data-label': t('review_column_action') }
		});
		const replaceButton = actionCell.createEl('button', { text: t('review_action_replace') });
		const ignoreButton = actionCell.createEl('button', { text: t('review_action_ignore') });
		const setAction = (replace: boolean): void => {
			this.selections[issue.id].selected = replace;
			replaceButton.toggleClass('mod-cta', replace);
			ignoreButton.toggleClass('mod-cta', !replace);
			row.toggleClass('is-ignored', !replace);
		};
		replaceButton.addEventListener('click', () => setAction(true));
		ignoreButton.addEventListener('click', () => setAction(false));
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
