import { App, EmbedCache, TFile } from 'obsidian';
import { extname } from 'node:path';
import { allocateImageName, createImageHash } from './image-naming';
import { cleanImageMetadata } from './metadata-cleaner';
import type { MetadataReport, MetadataRemover } from './metadata-cleaner';
import type { ReplacementRule } from './settings';
import { applyReplacements } from './transform';
import type { TextRangeReplacement } from './transform';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp']);

export interface ImageAsset {
	outputName: string;
	data: ArrayBuffer;
}

export interface PreparedImages {
	assets: ImageAsset[];
	replacements: TextRangeReplacement[];
	missingLinks: string[];
	failedImages: string[];
	metadataReports: MetadataReport[];
}

interface PreparedImageFile {
	outputName: string;
}

function escapeAltText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function getExtension(link: string): string {
	const withoutFragment = link.split('#', 1)[0];
	return extname(withoutFragment).toLowerCase();
}

export async function prepareImages(
	app: App,
	activeFile: TFile,
	embeds: EmbedCache[],
	rules: ReplacementRule[],
	metadataRemover?: MetadataRemover
): Promise<PreparedImages> {
	const assetsByName = new Map<string, ImageAsset>();
	const allocatedNames = new Map<string, string>();
	const preparedFiles = new Map<string, PreparedImageFile | null>();
	const replacements: TextRangeReplacement[] = [];
	const missingLinks = new Set<string>();
	const failedImages = new Set<string>();
	const metadataReports: MetadataReport[] = [];

	for (const embed of embeds) {
		if (!embed.link || !IMAGE_EXTENSIONS.has(getExtension(embed.link))) {
			continue;
		}

		const imageFile = app.metadataCache.getFirstLinkpathDest(embed.link, activeFile.path);
		if (!(imageFile instanceof TFile)) {
			missingLinks.add(embed.link);
			continue;
		}

		let preparedFile = preparedFiles.get(imageFile.path);
		if (preparedFile === undefined) {
			let data: ArrayBuffer;
			try {
				data = await app.vault.readBinary(imageFile);
			} catch {
				failedImages.add(imageFile.name);
				preparedFiles.set(imageFile.path, null);
				continue;
			}
			const cleanedImage = await cleanImageMetadata(imageFile.name, data, metadataRemover);
			metadataReports.push(cleanedImage.report);
			const extension = extname(imageFile.name).toLowerCase();
			const fullHash = createImageHash(cleanedImage.data);
			const outputName = allocateImageName(fullHash, extension, allocatedNames);
			if (!assetsByName.has(outputName)) {
				assetsByName.set(outputName, { outputName, data: cleanedImage.data });
			}
			preparedFile = { outputName };
			preparedFiles.set(imageFile.path, preparedFile);
		}
		if (preparedFile === null) continue;

		const altText = escapeAltText(applyReplacements(embed.displayText || '', rules));
		replacements.push({
			start: embed.position.start.offset,
			end: embed.position.end.offset,
			markdown: `![${altText}](${preparedFile.outputName})`
		});
	}

	return {
		assets: Array.from(assetsByName.values()),
		replacements,
		missingLinks: Array.from(missingLinks),
		failedImages: Array.from(failedImages),
		metadataReports
	};
}
