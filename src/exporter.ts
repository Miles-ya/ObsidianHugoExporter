import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ClaimedExportDirectory {
	directoryPath: string;
	directoryName: string;
	suffix: number;
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === 'object'
		&& error !== null
		&& 'code' in error
		&& (error as NodeJS.ErrnoException).code === 'EEXIST';
}

export async function claimExportDirectory(parentDirectory: string, baseName: string): Promise<ClaimedExportDirectory> {
	await mkdir(parentDirectory, { recursive: true });

	for (let suffix = 0; suffix < 10000; suffix += 1) {
		const directoryName = suffix === 0 ? baseName : `${baseName}${suffix}`;
		const directoryPath = join(parentDirectory, directoryName);
		try {
			await mkdir(directoryPath);
			return { directoryPath, directoryName, suffix };
		} catch (error) {
			if (!isAlreadyExistsError(error)) {
				throw error;
			}
		}
	}

	throw new Error('Unable to find an available export directory');
}
