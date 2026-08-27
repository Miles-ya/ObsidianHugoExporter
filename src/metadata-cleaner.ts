import { extname } from 'node:path';
import { removeMetadata } from 'picscrub';

export interface MetadataReport {
	imageName: string;
	status: 'cleaned' | 'unchanged' | 'failed';
	removedTypes: string[];
	originalSize: number;
	exportedSize: number;
	warning?: string;
}

export interface CleanedImage {
	data: ArrayBuffer;
	report: MetadataReport;
}

interface RemoveMetadataResult {
	data: Uint8Array;
	originalSize: number;
	cleanedSize: number;
	removedMetadata: string[];
}

export type MetadataRemover = (
	data: ArrayBuffer,
	options: { preserveOrientation: boolean; preserveColorProfile: boolean }
) => Promise<RemoveMetadataResult>;

const UNSAFE_SVG_PATTERNS = [
	/<script\b/i,
	/<foreignObject\b/i,
	/\son[a-z]+\s*=/i,
	/(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|file:|javascript:)/i,
	/url\(\s*["']?(?:https?:|\/\/|file:|javascript:)/i,
	/@import\b/i
];

function cloneArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	return bytes.slice().buffer;
}

export function validateCleanedSvg(data: ArrayBuffer): void {
	const svg = new TextDecoder('utf-8', { fatal: true }).decode(data);
	if (UNSAFE_SVG_PATTERNS.some(pattern => pattern.test(svg))) {
		throw new Error('Unsafe active or external SVG content');
	}
}

export async function cleanImageMetadata(
	imageName: string,
	data: ArrayBuffer,
	remover: MetadataRemover = removeMetadata
): Promise<CleanedImage> {
	const original = cloneArrayBuffer(data);
	if (extname(imageName).toLowerCase() === '.bmp') {
		return {
			data: original,
			report: {
				imageName,
				status: 'unchanged',
				removedTypes: [],
				originalSize: original.byteLength,
				exportedSize: original.byteLength
			}
		};
	}

	try {
		const result = await remover(original, {
			preserveOrientation: true,
			preserveColorProfile: true
		});
		const cleaned = cloneArrayBuffer(result.data);
		if (extname(imageName).toLowerCase() === '.svg') {
			validateCleanedSvg(cleaned);
		}

		return {
			data: cleaned,
			report: {
				imageName,
				status: result.removedMetadata.length > 0 || result.cleanedSize !== result.originalSize
					? 'cleaned'
					: 'unchanged',
				removedTypes: [...result.removedMetadata],
				originalSize: result.originalSize,
				exportedSize: result.cleanedSize
			}
		};
	} catch {
		return {
			data: original,
			report: {
				imageName,
				status: 'failed',
				removedTypes: [],
				originalSize: original.byteLength,
				exportedSize: original.byteLength,
				warning: 'Metadata cleaning failed; the original image will be exported.'
			}
		};
	}
}
