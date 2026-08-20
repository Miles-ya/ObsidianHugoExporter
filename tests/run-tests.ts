import { strict as assert } from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { claimExportDirectory } from '../src/exporter';
import { createHashedImageName } from '../src/image-naming';
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
	assert.equal(isSafeExportName('文章'), true);
	assert.equal(isSafeExportName('../文章'), false);
	assert.equal(isSafeExportName(''), false);
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

function testImageTransformation(): void {
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
	const firstName = createHashedImageName(first, '.PNG');
	assert.deepEqual(firstName, createHashedImageName(first, '.png'));
	assert.notEqual(firstName.fileName, createHashedImageName(second, '.png').fileName);
	assert.match(firstName.fileName, /^[a-f0-9]{16}\.png$/);
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

async function run(): Promise<void> {
	testTextTransformations();
	testDateAndNameHandling();
	testFrontmatterDetection();
	testDateFormatting();
	testImageTransformation();
	await testDirectoryClaims();
}

void run();
