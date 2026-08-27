import { createHash } from 'node:crypto';

export function createImageHash(data: ArrayBuffer): string {
	return createHash('sha256').update(Buffer.from(data)).digest('hex');
}

export function allocateImageName(
	fullHash: string,
	extension: string,
	allocatedNames: Map<string, string>
): string {
	for (let length = 16; length <= fullHash.length; length += 4) {
		const candidate = `${fullHash.slice(0, length)}${extension.toLowerCase()}`;
		const existingHash = allocatedNames.get(candidate);
		if (!existingHash || existingHash === fullHash) {
			allocatedNames.set(candidate, fullHash);
			return candidate;
		}
	}
	throw new Error('Unable to allocate a unique image filename');
}
