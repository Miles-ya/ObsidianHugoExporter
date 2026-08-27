import { strict as assert } from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { App, EmbedCache, TFile } from 'obsidian';
import { exportNote } from '../src/export-note';
import {
	claimExportDirectory,
	resolveExportParentDirectory,
	validateContentPath,
	validateHugoPath,
	writeExportBundle
} from '../src/exporter';
import { allocateImageName, createImageHash } from '../src/image-naming';
import type { ObsidianHugoExporterSettings } from '../src/settings';
import {
	applyReplacements,
	convertWikiLinks,
	findMarkdownBodyOffset,
	formatExportDate,
	isSafeExportName,
	replaceStringValues,
	stripDatePrefix,
	transformBodyWithImages
} from '../src/transform';

function testTextTransformations(): void {
	const rules = [
		{ from: '旧词', to: '新词' },
		{ from: 'new', to: 'final' },
		{ from: '', to: 'ignored' }
	];
	assert.equal(applyReplacements('旧词 new 旧词', rules), '新词 final 新词');
	assert.deepEqual(
		replaceStringValues({ oldKey: '旧词', nested: ['new', 42, false] }, rules),
		{ oldKey: '新词', nested: ['final', 42, false] }
	);
	assert.equal(convertWikiLinks('[[目标笔记|显示文字]]'), '[显示文字](../%E7%9B%AE%E6%A0%87%E7%AC%94%E8%AE%B0/)');
	assert.equal(convertWikiLinks('![[缺失图片.png]]'), '![[缺失图片.png]]');
}

function testDateAndNameHandling(): void {
	assert.equal(stripDatePrefix('2025-11-23 我的日记'), '我的日记');
	assert.equal(stripDatePrefix('2025-02-29 非法日期'), '2025-02-29 非法日期');
	assert.equal(stripDatePrefix('2024-02-29 合法闰日'), '合法闰日');
	assert.equal(stripDatePrefix('2025-1-02 非严格日期'), '2025-1-02 非严格日期');
	assert.equal(stripDatePrefix('2025-11-23'), '2025-11-23');

	for (const validName of ['文章', 'CON文章', '带 空格']) {
		assert.equal(isSafeExportName(validName), true, validName);
	}
	for (const invalidName of [
		'', '.', '..', '../文章', '文章/子目录', '文章\\子目录', 'bad:name', 'bad?',
		'name.', 'name ', 'CON', 'con.txt', 'LPT1', `control${String.fromCharCode(1)}`
	]) {
		assert.equal(isSafeExportName(invalidName), false, invalidName);
	}
}

function testFrontmatterDetection(): void {
	assert.equal(findMarkdownBodyOffset('正文'), 0);
	assert.equal(findMarkdownBodyOffset('---\ntitle: 测试\n---\n正文'), '---\ntitle: 测试\n---\n'.length);
	assert.equal(findMarkdownBodyOffset('---\r\ntitle: 测试\r\n---\r\n正文'), '---\r\ntitle: 测试\r\n---\r\n'.length);
	assert.equal(findMarkdownBodyOffset('---\ntitle: 未闭合\n正文'), 0);
}

function testDateFormatting(): void {
	const fallback = new Date(2026, 7, 20, 12, 34, 56).getTime();
	assert.match(formatExportDate(undefined, fallback), /^2026-08-20T12:34:56[+-]\d{2}:\d{2}$/);
	assert.match(formatExportDate('2025-11-23', fallback), /^2025-11-23T00:00:00[+-]\d{2}:\d{2}$/);
	assert.equal(formatExportDate('invalid', fallback), formatExportDate(undefined, fallback));
}

function testImageTransformationAndNaming(): void {
	const raw = '---\ntitle: demo\n---\n正文旧词 ![[图片.png]] 结尾旧词';
	const bodyStart = raw.indexOf('正文');
	const imageStart = raw.indexOf('![[图片.png]]');
	const output = transformBodyWithImages(raw, bodyStart, [{
		start: imageStart,
		end: imageStart + '![[图片.png]]'.length,
		markdown: '![](0123456789abcdef.png)'
	}], [
		{ from: '旧词', to: '新词' },
		{ from: '.png', to: '.jpg' }
	]);
	assert.equal(output, '正文新词 ![](0123456789abcdef.png) 结尾新词');

	const first = new TextEncoder().encode('same image').buffer;
	const second = new TextEncoder().encode('other image').buffer;
	assert.equal(createImageHash(first), createImageHash(first));
	assert.notEqual(createImageHash(first), createImageHash(second));
	assert.match(createImageHash(first), /^[a-f0-9]{64}$/);

	const allocated = new Map<string, string>();
	const firstHash = `${'a'.repeat(16)}${'b'.repeat(48)}`;
	const collidingHash = `${'a'.repeat(16)}${'c'.repeat(48)}`;
	assert.equal(allocateImageName(firstHash, '.PNG', allocated), `${'a'.repeat(16)}.png`);
	assert.equal(allocateImageName(collidingHash, '.png', allocated), `${'a'.repeat(16)}cccc.png`);
}

function testPathValidation(): void {
	const absoluteRoot = path.resolve(os.tmpdir(), 'hugo-root');
	assert.equal(validateHugoPath(absoluteRoot), true);
	assert.equal(validateHugoPath('relative/hugo'), false);
	assert.equal(validateContentPath('content/posts'), true);
	assert.equal(validateContentPath('../outside'), false);
	assert.equal(validateContentPath('../../hugo-root-other'), false);
	assert.equal(validateContentPath(path.resolve('/outside')), false);
	assert.equal(
		resolveExportParentDirectory(absoluteRoot, 'content/posts'),
		path.join(absoluteRoot, 'content/posts')
	);
	assert.throws(() => resolveExportParentDirectory(absoluteRoot, '../hugo-root-other'));
}

async function assertPathMissing(targetPath: string): Promise<void> {
	await assert.rejects(fs.access(targetPath));
}

async function testDirectoryClaims(): Promise<void> {
	const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hugo-exporter-test-'));
	try {
		const first = await claimExportDirectory(temporaryRoot, '文章');
		const second = await claimExportDirectory(temporaryRoot, '文章');
		const third = await claimExportDirectory(temporaryRoot, '文章');
		assert.equal(first.directoryName, '文章');
		assert.equal(second.directoryName, '文章1');
		assert.equal(third.directoryName, '文章2');
		assert.equal(third.suffix, 2);
	} finally {
		await fs.rm(temporaryRoot, { recursive: true, force: true });
	}
}

async function testSafeBundleWriting(): Promise<void> {
	const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hugo-writer-test-'));
	const asset = { outputName: 'asset.png', data: new TextEncoder().encode('image').buffer };
	try {
		const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'hugo-writer-outside-'));
		await assert.rejects(writeExportBundle(temporaryRoot, {
			directoryPath: outsideDirectory,
			directoryName: '../outside',
			suffix: 0
		}, 'markdown', []));
		await fs.access(outsideDirectory);
		await fs.rm(outsideDirectory, { recursive: true, force: true });

		const successful = await claimExportDirectory(temporaryRoot, 'success');
		const renamedPaths: string[] = [];
		await writeExportBundle(temporaryRoot, successful, 'markdown', [asset], {
			rename: async (oldPath, newPath) => {
				renamedPaths.push(newPath);
				await fs.rename(oldPath, newPath);
			}
		});
		assert.equal(path.basename(renamedPaths.at(-1) || ''), 'index.md');
		assert.equal(await fs.readFile(path.join(successful.directoryPath, 'index.md'), 'utf8'), 'markdown');

		for (const failureType of ['image-write', 'markdown-write', 'rename'] as const) {
			const claimed = await claimExportDirectory(temporaryRoot, failureType);
			const overrides = failureType === 'rename'
				? { rename: async (): Promise<void> => { throw new Error('rename failed'); } }
				: {
					writeFile: async (filePath: string, data: string | Uint8Array): Promise<void> => {
						const shouldFail = failureType === 'image-write'
							? filePath.endsWith('.png.tmp')
							: filePath.endsWith('.index.md.tmp');
						if (shouldFail) {
							throw new Error(`${failureType} failed`);
						}
						await fs.writeFile(filePath, data);
					}
				};
			await assert.rejects(writeExportBundle(temporaryRoot, claimed, 'markdown', [asset], overrides));
			await assertPathMissing(claimed.directoryPath);
		}
	} finally {
		await fs.rm(temporaryRoot, { recursive: true, force: true });
	}
}

function createRuntimeTFile(properties: Record<string, unknown>): TFile {
	return Object.assign(new TFile(), properties);
}

async function testCompleteExport(): Promise<void> {
	const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hugo-export-note-test-'));
	const raw = '---\ntitle: Custom title\ndate: 2026-08-20\n---\nBody ![[ok.png]] ![[missing.png]] ![[failed.png]]';
	const activeFile = createRuntimeTFile({
		basename: '2026-08-20 Demo',
		name: '2026-08-20 Demo.md',
		path: 'posts/2026-08-20 Demo.md',
		stat: { mtime: new Date(2026, 7, 20).getTime() }
	});
	const okImage = createRuntimeTFile({ name: 'ok.png', path: 'assets/ok.png' });
	const failedImage = createRuntimeTFile({ name: 'failed.png', path: 'assets/failed.png' });
	const embeds = ['ok.png', 'missing.png', 'failed.png'].map(link => {
		const text = `![[${link}]]`;
		const start = raw.indexOf(text);
		return {
			link,
			displayText: '',
			position: { start: { offset: start }, end: { offset: start + text.length } }
		} as EmbedCache;
	});
	const app = {
		vault: {
			read: async () => raw,
			readBinary: async (file: TFile) => {
				if (file === failedImage) {
					throw new Error('read failed');
				}
				return new TextEncoder().encode('valid image').buffer;
			}
		},
		metadataCache: {
			getFileCache: () => ({
				frontmatter: { title: 'Custom title', date: '2026-08-20', position: {} },
				embeds
			}),
			getFirstLinkpathDest: (link: string) => {
				if (link === 'ok.png') return okImage;
				if (link === 'failed.png') return failedImage;
				return null;
			}
		}
	} as unknown as App;
	const settings: ObsidianHugoExporterSettings = {
		hugoPath: temporaryRoot,
		contentPath: 'content/posts',
		replacementRules: [{ from: 'Body', to: 'Text' }]
	};

	try {
		const first = await exportNote(app, activeFile, settings);
		assert.equal(first.directoryName, 'Demo');
		assert.deepEqual(first.warnings, [
			{ type: 'missing-image', value: 'missing.png' },
			{ type: 'image-read-failed', value: 'failed.png' }
		]);
		const firstIndex = await fs.readFile(path.join(temporaryRoot, 'content/posts/Demo/index.md'), 'utf8');
		assert.match(firstIndex, /title: Custom title/);
		assert.match(firstIndex, /Text !\[\]\([a-f0-9]{16}\.png\)/);
		assert.match(firstIndex, /!\[\[missing\.png\]\]/);
		assert.match(firstIndex, /!\[\[failed\.png\]\]/);
		assert.doesNotMatch(firstIndex, /position:/);

		const second = await exportNote(app, activeFile, settings);
		assert.equal(second.directoryName, 'Demo1');
		const secondIndex = await fs.readFile(path.join(temporaryRoot, 'content/posts/Demo1/index.md'), 'utf8');
		assert.match(secondIndex, /title: Custom title1/);
	} finally {
		await fs.rm(temporaryRoot, { recursive: true, force: true });
	}
}

async function testLocaleParity(): Promise<void> {
	const en = JSON.parse(await fs.readFile('lang/en.json', 'utf8')) as Record<string, string>;
	const zh = JSON.parse(await fs.readFile('lang/zh.json', 'utf8')) as Record<string, string>;
	assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
}

async function run(): Promise<void> {
	testTextTransformations();
	testDateAndNameHandling();
	testFrontmatterDetection();
	testDateFormatting();
	testImageTransformationAndNaming();
	testPathValidation();
	await testDirectoryClaims();
	await testSafeBundleWriting();
	await testCompleteExport();
	await testLocaleParity();
}

void run();
