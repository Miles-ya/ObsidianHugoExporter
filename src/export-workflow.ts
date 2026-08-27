import { App, TFile } from 'obsidian';
import { getAiReviewErrorCode, reviewMarkdown } from './ai-review';
import type { ReviewResult } from './ai-review';
import {
	commitExport,
	discardExport,
	prepareExport
} from './export-note';
import type { ExportResult, PreparedExport } from './export-note';
import { ExportRollbackError } from './exporter';
import { t } from './i18n';
import { applyReviewFixes } from './review-fixes';
import {
	ExportProgressModal,
	showReviewError,
	showReviewModal
} from './review-modal';
import type { ErrorAction, ExportStage, ReviewDecision } from './review-modal';
import type { ObsidianHugoExporterSettings } from './settings';

export interface ExportWorkflowOptions {
	openSettings: () => void;
	dependencies?: Partial<ExportWorkflowDependencies>;
}

export interface ProgressController {
	cancelled: Promise<void>;
	open(): void;
	finish(): void;
	setStage(stage: ExportStage): void;
	wasCancelled(): boolean;
}

export interface ExportWorkflowDependencies {
	prepare: typeof prepareExport;
	commit: typeof commitExport;
	discard: typeof discardExport;
	review: typeof reviewMarkdown;
	createProgress: (app: App) => ProgressController;
	showReview: (
		app: App,
		fileName: string,
		markdown: string,
		issues: ReviewResult['issues'],
		metadataReports: PreparedExport['metadataReports']
	) => Promise<ReviewDecision | null>;
	showError: (app: App, message: string) => Promise<ErrorAction>;
}

const DEFAULT_DEPENDENCIES: ExportWorkflowDependencies = {
	prepare: prepareExport,
	commit: commitExport,
	discard: discardExport,
	review: reviewMarkdown,
	createProgress: app => new ExportProgressModal(app),
	showReview: showReviewModal,
	showError: showReviewError
};

async function cleanupPreparedExport(
	prepared: PreparedExport,
	dependencies: ExportWorkflowDependencies,
	cause: unknown
): Promise<void> {
	try {
		await dependencies.discard(prepared);
	} catch (cleanupError) {
		throw new ExportRollbackError(cause, cleanupError);
	}
}

function getAiErrorMessage(error: unknown): string {
	return t(`review_error_${getAiReviewErrorCode(error)}`);
}

async function runAiReview(
	app: App,
	prepared: PreparedExport,
	settings: ObsidianHugoExporterSettings,
	initialProgress: ProgressController,
	openSettings: () => void,
	dependencies: ExportWorkflowDependencies
): Promise<ReviewResult | null> {
	let progress = initialProgress;
	progress.setStage('review');

	while (true) {
		const outcome = await Promise.race([
			dependencies.review(app, prepared.markdown, settings)
				.then(value => ({ type: 'result' as const, value }))
				.catch((error: unknown) => ({ type: 'error' as const, error })),
			progress.cancelled.then(() => ({ type: 'cancel' as const }))
		]);
		if (outcome.type === 'cancel') return null;
		progress.finish();
		if (outcome.type === 'result') return outcome.value;

		const action = await dependencies.showError(app, getAiErrorMessage(outcome.error));
		if (action === 'settings') {
			openSettings();
			return null;
		}
		if (action === 'cancel') return null;
		progress = dependencies.createProgress(app);
		progress.open();
		progress.setStage('review');
	}
}

export async function runExportWorkflow(
	app: App,
	activeFile: TFile,
	settings: ObsidianHugoExporterSettings,
	options: ExportWorkflowOptions
): Promise<ExportResult | null> {
	const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
	let prepared: PreparedExport | null = null;
	let committed = false;
	const progress = dependencies.createProgress(app);
	progress.open();

	try {
		prepared = await dependencies.prepare(app, activeFile, settings, {
			onStage: stage => progress.setStage(stage)
		});
		if (progress.wasCancelled()) {
			const cancelledPrepared = prepared;
			prepared = null;
			await cleanupPreparedExport(
				cancelledPrepared,
				dependencies,
				new Error('Export was cancelled before commit')
			);
			return null;
		}

		let review: ReviewResult = { issues: [] };
		if (settings.aiReviewEnabled) {
			const result = await runAiReview(
				app,
				prepared,
				settings,
				progress,
				options.openSettings,
				dependencies
			);
			if (!result) {
				const cancelledPrepared = prepared;
				prepared = null;
				await cleanupPreparedExport(
					cancelledPrepared,
					dependencies,
					new Error('Export was cancelled before commit')
				);
				return null;
			}
			review = result;
		} else {
			progress.finish();
		}

		const hasMetadataFailure = prepared.metadataReports.some(report => report.status === 'failed');
		let markdown = prepared.markdown;
		if (review.issues.length > 0 || hasMetadataFailure) {
			const decision = await dependencies.showReview(
				app,
				activeFile.name,
				prepared.markdown,
				review.issues,
				prepared.metadataReports
			);
			if (!decision) {
				const cancelledPrepared = prepared;
				prepared = null;
				await cleanupPreparedExport(
					cancelledPrepared,
					dependencies,
					new Error('Export was cancelled before commit')
				);
				return null;
			}
			markdown = applyReviewFixes(prepared.markdown, review.issues, decision.selections);
		}

		const result = await dependencies.commit(prepared, markdown);
		committed = true;
		return result;
	} catch (error) {
		if (prepared && !committed) {
			await cleanupPreparedExport(prepared, dependencies, error);
			prepared = null;
		}
		throw error;
	} finally {
		progress.finish();
	}
}
