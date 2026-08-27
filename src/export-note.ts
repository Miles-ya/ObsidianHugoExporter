import { App, TFile } from 'obsidian';
import { stringify as stringifyYaml } from 'yaml';
import {
	claimExportDirectory,
	ExportRollbackError,
	removeClaimedExportDirectory,
	resolveExportParentDirectory,
	writeExportBundle
} from './exporter';
import { prepareImages } from './images';
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
}

export class InvalidExportNameError extends Error {
	constructor(readonly fileName: string) {
		super(`Invalid export directory name: ${fileName}`);
		this.name = 'InvalidExportNameError';
	}
}

export async function exportNote(
	app: App,
	activeFile: TFile,
	settings: ObsidianHugoExporterSettings
): Promise<ExportResult> {
	const parentDirectory = resolveExportParentDirectory(settings.hugoPath, settings.contentPath);
	const rawContent = await app.vault.read(activeFile);
	const fileCache = app.metadataCache.getFileCache(activeFile);
	const rules = settings.replacementRules;
	const cleanedTitle = stripDatePrefix(activeFile.basename);
	const exportBaseName = applyReplacements(cleanedTitle, rules).trim();

	if (!isSafeExportName(exportBaseName)) {
		throw new InvalidExportNameError(exportBaseName || activeFile.basename);
	}

	const preparedImages = await prepareImages(app, activeFile, fileCache?.embeds || [], rules);
	const claimedDirectory = await claimExportDirectory(parentDirectory, exportBaseName);
	const markdownContent = convertWikiLinks(transformBodyWithImages(
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

	try {
		const finalContent = `---\n${stringifyYaml(frontmatter)}---\n\n${markdownContent}`;
		await writeExportBundle(parentDirectory, claimedDirectory, finalContent, preparedImages.assets);
	} catch (error) {
		try {
			await removeClaimedExportDirectory(parentDirectory, claimedDirectory);
		} catch (cleanupError) {
			if (error instanceof ExportRollbackError) {
				throw error;
			}
			throw new ExportRollbackError(error, cleanupError);
		}
		throw error;
	}

	return {
		directoryName: claimedDirectory.directoryName,
		warnings: [
			...preparedImages.missingLinks.map(value => ({ type: 'missing-image' as const, value })),
			...preparedImages.failedImages.map(value => ({ type: 'image-read-failed' as const, value }))
		]
	};
}
