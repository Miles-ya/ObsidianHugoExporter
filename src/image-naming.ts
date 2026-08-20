import { createHash } from 'crypto';

export interface HashedImageName {
	fullHash: string;
	fileName: string;
}

export function createHashedImageName(data: ArrayBuffer, extension: string): HashedImageName {
	const fullHash = createHash('sha256').update(Buffer.from(data)).digest('hex');
	return {
		fullHash,
		fileName: `${fullHash.slice(0, 16)}${extension.toLowerCase()}`
	};
}
