import { App, EmbedCache, TFile } from 'obsidian';
import { extname } from 'node:path';
import { createHashedImageName } from './image-naming';
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
}

function escapeAltText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function getExtension(link: string): string {
	const withoutFragment = link.split('#', 1)[0];
	return extname(withoutFragment).toLowerCase();
}

function allocateOutputName(
	fullHash: string,
	extension: string,
	allocatedNames: Map<string, string>
): string {
	for (let length = 16; length <= fullHash.length; length += 4) {
		const candidate = `${fullHash.slice(0, length)}${extension}`;
		const existingHash = allocatedNames.get(candidate);
		if (!existingHash || existingHash === fullHash) {
			allocatedNames.set(candidate, fullHash);
			return candidate;
		}
	}
	throw new Error('Unable to allocate a unique image filename');
}

export async function prepareImages(
	app: App,
	activeFile: TFile,
	embeds: EmbedCache[],
	rules: ReplacementRule[]
): Promise<PreparedImages> {
	const assetsByName = new Map<string, ImageAsset>();
	const allocatedNames = new Map<string, string>();
	const replacements: TextRangeReplacement[] = [];
	const missingLinks: string[] = [];
	const failedImages: string[] = [];

	for (const embed of embeds) {
		if (!embed.link || !IMAGE_EXTENSIONS.has(getExtension(embed.link))) {
			continue;
		}

		const imageFile = app.metadataCache.getFirstLinkpathDest(embed.link, activeFile.path);
		if (!(imageFile instanceof TFile)) {
			missingLinks.push(embed.link);
			continue;
		}

		let data: ArrayBuffer;
		try {
			data = await app.vault.readBinary(imageFile);
		} catch {
			failedImages.push(imageFile.name);
			continue;
		}
		const extension = extname(imageFile.name).toLowerCase();
		const { fullHash } = createHashedImageName(data, extension);
		const outputName = allocateOutputName(fullHash, extension, allocatedNames);
		if (!assetsByName.has(outputName)) {
			assetsByName.set(outputName, { outputName, data });
		}

		const altText = escapeAltText(applyReplacements(embed.displayText || '', rules));
		replacements.push({
			start: embed.position.start.offset,
			end: embed.position.end.offset,
			markdown: `![${altText}](${outputName})`
		});
	}

	return {
		assets: Array.from(assetsByName.values()),
		replacements,
		missingLinks,
		failedImages
	};
}
