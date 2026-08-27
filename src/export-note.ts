import { App, TFile } from 'obsidian';
import { stringify as stringifyYaml } from 'yaml';
import {
	claimExportDirectory,
	ExportRollbackError,
	removeClaimedExportDirectory,
	resolveExportParentDirectory,
	writeExportBundle
} from './exporter';
import type { ClaimedExportDirectory } from './exporter';
import { prepareImages } from './images';
import type { ImageAsset } from './images';
import type { MetadataReport, MetadataRemover } from './metadata-cleaner';
import type { ObsidianHugoExporterSettings } from './settings';
import {
	applyReplacements,
	convertWikiLinks,
	findMarkdownBodyOffset,
	formatExportDate,
	isSafeExportName,
	replaceStringValues,
	stripDatePrefix,
	transformBodyWithImages
} from './transform';

export type ExportWarning =
	| { type: 'missing-image'; value: string }
	| { type: 'image-read-failed'; value: string };

export interface ExportResult {
	directoryName: string;
	warnings: ExportWarning[];
	metadataReports: MetadataReport[];
}

export interface PreparedExport {
	parentDirectory: string;
	claimedDirectory: ClaimedExportDirectory;
	markdown: string;
	assets: ImageAsset[];
	warnings: ExportWarning[];
	metadataReports: MetadataReport[];
}

export interface PrepareExportOptions {
	onStage?: (stage: 'prepare' | 'metadata') => void;
	metadataRemover?: MetadataRemover;
}

export class InvalidExportNameError extends Error {
	constructor(readonly fileName: string) {
		super(`Invalid export directory name: ${fileName}`);
		this.name = 'InvalidExportNameError';
	}
}

async function rollbackPreparedExport(prepared: PreparedExport, error: unknown): Promise<never> {
	try {
		await removeClaimedExportDirectory(prepared.parentDirectory, prepared.claimedDirectory);
	} catch (cleanupError) {
		throw new ExportRollbackError(error, cleanupError);
	}
	throw error;
}

export async function prepareExport(
	app: App,
	activeFile: TFile,
	settings: ObsidianHugoExporterSettings,
	options: PrepareExportOptions = {}
): Promise<PreparedExport> {
	options.onStage?.('prepare');
	const parentDirectory = resolveExportParentDirectory(settings.hugoPath, settings.contentPath);
	const rawContent = await app.vault.read(activeFile);
	const fileCache = app.metadataCache.getFileCache(activeFile);
	const rules = settings.replacementRules;
	const cleanedTitle = stripDatePrefix(activeFile.basename);
	const exportBaseName = applyReplacements(cleanedTitle, rules).trim();

	if (!isSafeExportName(exportBaseName)) {
		throw new InvalidExportNameError(exportBaseName || activeFile.basename);
	}

	options.onStage?.('metadata');
	const preparedImages = await prepareImages(
		app,
		activeFile,
		fileCache?.embeds || [],
		rules,
		options.metadataRemover
	);
	const claimedDirectory = await claimExportDirectory(parentDirectory, exportBaseName);
	const prepared: PreparedExport = {
		parentDirectory,
		claimedDirectory,
		markdown: '',
		assets: preparedImages.assets,
		warnings: [
			...preparedImages.missingLinks.map(value => ({ type: 'missing-image' as const, value })),
			...preparedImages.failedImages.map(value => ({ type: 'image-read-failed' as const, value }))
		],
		metadataReports: preparedImages.metadataReports
	};

	try {
		const markdownBody = convertWikiLinks(transformBodyWithImages(
			rawContent,
			findMarkdownBodyOffset(rawContent),
			preparedImages.replacements,
			rules
		));

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

		prepared.markdown = `---\n${stringifyYaml(frontmatter)}---\n\n${markdownBody}`;
		return prepared;
	} catch (error) {
		return rollbackPreparedExport(prepared, error);
	}
}

export async function commitExport(
	prepared: PreparedExport,
	markdown: string = prepared.markdown
): Promise<ExportResult> {
	await writeExportBundle(
		prepared.parentDirectory,
		prepared.claimedDirectory,
		markdown,
		prepared.assets
	);
	return {
		directoryName: prepared.claimedDirectory.directoryName,
		warnings: prepared.warnings,
		metadataReports: prepared.metadataReports
	};
}

export async function discardExport(prepared: PreparedExport): Promise<void> {
	await removeClaimedExportDirectory(prepared.parentDirectory, prepared.claimedDirectory);
}

export async function exportNote(
	app: App,
	activeFile: TFile,
	settings: ObsidianHugoExporterSettings
): Promise<ExportResult> {
	const prepared = await prepareExport(app, activeFile, settings);
	return commitExport(prepared);
}
