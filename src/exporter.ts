import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface ClaimedExportDirectory {
	directoryPath: string;
	directoryName: string;
	suffix: number;
}

export interface WritableExportAsset {
	outputName: string;
	data: ArrayBuffer;
}

export interface ExportFileOperations {
	writeFile(path: string, data: string | Uint8Array): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	remove(path: string): Promise<void>;
}

const DEFAULT_FILE_OPERATIONS: ExportFileOperations = {
	writeFile: (path, data) => writeFile(path, data),
	rename,
	remove: path => rm(path, { recursive: true, force: true })
};

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

export function validateHugoPath(hugoPath: string): boolean {
	return hugoPath.trim().length > 0 && isAbsolute(hugoPath);
}

export function validateContentPath(contentPath: string): boolean {
	if (!contentPath.trim() || isAbsolute(contentPath)) {
		return false;
	}

	const validationRoot = resolve(sep, '__hugo_export_root__');
	const normalized = resolve(validationRoot, contentPath);
	const relativePath = relative(validationRoot, normalized);
	return relativePath !== '..'
		&& !relativePath.startsWith(`..${sep}`)
		&& !isAbsolute(relativePath);
}

export function resolveExportParentDirectory(hugoPath: string, contentPath: string): string {
	if (!validateHugoPath(hugoPath)) {
		throw new ExportPathError('invalid-hugo-path');
	}
	if (!validateContentPath(contentPath)) {
		throw new ExportPathError('invalid-content-path');
	}

	const rootDirectory = resolve(hugoPath);
	const parentDirectory = resolve(rootDirectory, contentPath);
	const relativePath = relative(rootDirectory, parentDirectory);
	if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
		throw new ExportPathError('invalid-content-path');
	}
	return parentDirectory;
}

export type ExportPathErrorCode = 'invalid-hugo-path' | 'invalid-content-path';

export class ExportPathError extends Error {
	constructor(readonly code: ExportPathErrorCode) {
		super(code);
		this.name = 'ExportPathError';
	}
}

export class ExportRollbackError extends Error {
	constructor(
		readonly exportError: unknown,
		readonly cleanupError: unknown
	) {
		super('Export failed and the incomplete export directory could not be removed');
		this.name = 'ExportRollbackError';
	}
}

function verifiedClaimedPath(
	parentDirectory: string,
	claimedDirectory: ClaimedExportDirectory
): string {
	const resolvedParent = resolve(parentDirectory);
	const expectedPath = resolve(resolvedParent, claimedDirectory.directoryName);
	if (
		dirname(expectedPath) !== resolvedParent
		|| expectedPath !== resolve(claimedDirectory.directoryPath)
	) {
		throw new Error('Refusing to operate on an export directory outside its claimed parent');
	}
	return expectedPath;
}

export async function removeClaimedExportDirectory(
	parentDirectory: string,
	claimedDirectory: ClaimedExportDirectory,
	remove: ExportFileOperations['remove'] = path => DEFAULT_FILE_OPERATIONS.remove(path)
): Promise<void> {
	await remove(verifiedClaimedPath(parentDirectory, claimedDirectory));
}

export async function writeExportBundle(
	parentDirectory: string,
	claimedDirectory: ClaimedExportDirectory,
	markdown: string,
	assets: WritableExportAsset[],
	overrides: Partial<ExportFileOperations> = {}
): Promise<void> {
	const operations = { ...DEFAULT_FILE_OPERATIONS, ...overrides };
	const directoryPath = verifiedClaimedPath(parentDirectory, claimedDirectory);
	const temporaryAssets = assets.map(asset => ({
		...asset,
		temporaryPath: join(directoryPath, `.${asset.outputName}.tmp`),
		finalPath: join(directoryPath, asset.outputName)
	}));
	const temporaryIndexPath = join(directoryPath, '.index.md.tmp');
	const finalIndexPath = join(directoryPath, 'index.md');

	try {
		for (const asset of temporaryAssets) {
			await operations.writeFile(asset.temporaryPath, Buffer.from(asset.data));
		}
		await operations.writeFile(temporaryIndexPath, markdown);

		for (const asset of temporaryAssets) {
			await operations.rename(asset.temporaryPath, asset.finalPath);
		}
		await operations.rename(temporaryIndexPath, finalIndexPath);
	} catch (error) {
		try {
			await removeClaimedExportDirectory(parentDirectory, claimedDirectory, operations.remove);
		} catch (cleanupError) {
			throw new ExportRollbackError(error, cleanupError);
		}
		throw error;
	}
}
