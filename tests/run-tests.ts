import { strict as assert } from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { App, EmbedCache, TFile } from 'obsidian';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { AiReviewError, buildReviewInstructions, reviewMarkdown } from '../src/ai-review';
import type { ReviewIssue } from '../src/ai-review';
import { exportNote } from '../src/export-note';
import type { ExportResult, PreparedExport } from '../src/export-note';
import { runExportWorkflow } from '../src/export-workflow';
import type { ExportWorkflowDependencies, ProgressController } from '../src/export-workflow';
import {
	claimExportDirectory,
	ExportRollbackError,
	resolveExportParentDirectory,
	validateContentPath,
	validateHugoPath,
	writeExportBundle
} from '../src/exporter';
import { allocateImageName, createImageHash } from '../src/image-naming';
import { prepareImages } from '../src/images';
import { cleanImageMetadata, validateCleanedSvg } from '../src/metadata-cleaner';
import { applyReviewFixes, validateReviewFixes } from '../src/review-fixes';
import { applySettingControlChange } from '../src/settings';
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

function concatenateBytes(...parts: Uint8Array[]): Uint8Array {
	const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
	const output = new Uint8Array(12 + data.length);
	new DataView(output.buffer).setUint32(0, data.length);
	output.set(new TextEncoder().encode(type), 4);
	output.set(data, 8);
	return output;
}

function createWebpChunk(type: string, data: Uint8Array): Uint8Array {
	const padding = data.length % 2;
	const output = new Uint8Array(8 + data.length + padding);
	output.set(new TextEncoder().encode(type), 0);
	new DataView(output.buffer).setUint32(4, data.length, true);
	output.set(data, 8);
	return output;
}

async function testMetadataCleaning(): Promise<void> {
	const encoder = new TextEncoder();
	const exif = encoder.encode('Exif\0\0abcd');
	const jpeg = new Uint8Array(2 + 2 + 2 + exif.length + 2);
	jpeg.set([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2], 0);
	jpeg.set(exif, 6);
	jpeg.set([0xff, 0xd9], 6 + exif.length);

	const png = concatenateBytes(
		new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
		createPngChunk('tEXt', encoder.encode('GPS\0secret')),
		createPngChunk('IEND', new Uint8Array())
	);
	const webpPayload = concatenateBytes(
		encoder.encode('WEBP'),
		createWebpChunk('EXIF', encoder.encode('secret'))
	);
	const webp = new Uint8Array(8 + webpPayload.length);
	webp.set(encoder.encode('RIFF'));
	new DataView(webp.buffer).setUint32(4, webpPayload.length, true);
	webp.set(webpPayload, 8);
	const gif = new Uint8Array([
		71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0,
		33, 254, 3, 71, 80, 83, 0, 59
	]);
	const svg = encoder.encode(
		'<svg xmlns="http://www.w3.org/2000/svg"><metadata>GPS</metadata><rect/></svg>'
	);

	for (const [name, bytes] of [
		['photo.jpg', jpeg],
		['photo.png', png],
		['photo.webp', webp],
		['photo.gif', gif],
		['photo.svg', svg]
	] as const) {
		const result = await cleanImageMetadata(name, bytes.slice().buffer);
		assert.equal(result.report.status, 'cleaned', name);
		assert.ok(result.report.removedTypes.length > 0, name);
		assert.ok(result.data.byteLength < bytes.byteLength, name);
	}

	const bitmap = encoder.encode('BM unmodified').buffer;
	const bmpResult = await cleanImageMetadata('photo.bmp', bitmap);
	assert.equal(bmpResult.report.status, 'unchanged');
	assert.deepEqual(new Uint8Array(bmpResult.data), new Uint8Array(bitmap));

	let receivedOptions: { preserveOrientation: boolean; preserveColorProfile: boolean } | null = null;
	const preserved = await cleanImageMetadata('photo.jpg', jpeg.buffer, async (data, options) => {
		receivedOptions = options;
		return {
			data: new Uint8Array(data),
			originalSize: data.byteLength,
			cleanedSize: data.byteLength,
			removedMetadata: []
		};
	});
	assert.deepEqual(receivedOptions, { preserveOrientation: true, preserveColorProfile: true });
	assert.equal(preserved.report.status, 'unchanged');

	const failed = await cleanImageMetadata('photo.png', png.buffer, async () => {
		throw new Error('sanitizer failed');
	});
	assert.equal(failed.report.status, 'failed');
	assert.deepEqual(new Uint8Array(failed.data), png);

	const unsafeSvg = encoder.encode('<svg><script>alert(1)</script></svg>').buffer;
	assert.throws(() => validateCleanedSvg(unsafeSvg));
	const unsafeResult = await cleanImageMetadata('unsafe.svg', unsafeSvg, async data => ({
		data: new Uint8Array(data),
		originalSize: data.byteLength,
		cleanedSize: data.byteLength,
		removedMetadata: []
	}));
	assert.equal(unsafeResult.report.status, 'failed');
}

async function testPreparedImageDeduplication(): Promise<void> {
	const activeFile = createRuntimeTFile({ path: 'article.md' });
	const imageFile = createRuntimeTFile({ name: 'photo.png', path: 'assets/photo.png' });
	let readCount = 0;
	let cleaningCount = 0;
	const sourceData = new TextEncoder().encode('source').buffer;
	const cleanedData = new TextEncoder().encode('cleaned').buffer;
	const app = {
		vault: {
			readBinary: async () => {
				readCount += 1;
				return sourceData;
			}
		},
		metadataCache: {
			getFirstLinkpathDest: () => imageFile
		}
	} as unknown as App;
	const embeds = [0, 20].map(offset => ({
		link: 'photo.png',
		displayText: '',
		position: { start: { offset }, end: { offset: offset + 14 } }
	})) as EmbedCache[];
	const prepared = await prepareImages(app, activeFile, embeds, [], async data => {
		cleaningCount += 1;
		return {
			data: new Uint8Array(cleanedData),
			originalSize: data.byteLength,
			cleanedSize: cleanedData.byteLength,
			removedMetadata: ['EXIF']
		};
	});
	assert.equal(readCount, 1);
	assert.equal(cleaningCount, 1);
	assert.equal(prepared.assets.length, 1);
	assert.equal(prepared.replacements.length, 2);
	assert.equal(prepared.metadataReports.length, 1);
	assert.equal(prepared.assets[0].outputName, `${createImageHash(cleanedData).slice(0, 16)}.png`);
}

function createReviewIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
	return {
		id: 'issue-1',
		level: 'warning',
		category: 'personal-privacy',
		title: 'Private path',
		reason: 'Local path',
		exactText: '/home/user/private',
		suggestedReplacement: 'project directory',
		...overrides
	};
}

function testReviewFixes(): void {
	const markdown = '---\ntitle: Safe\n---\n\nUse /home/user/private here.';
	const warning = createReviewIssue();
	const blocking = createReviewIssue({
		id: 'secret',
		level: 'blocking',
		category: 'identity-financial',
		exactText: 'Safe',
		suggestedReplacement: 'Redacted'
	});

	assert.equal(validateReviewFixes(markdown, [blocking], {}), null);
	const selections = {
		[warning.id]: { selected: true, replacement: 'workspace' },
		[blocking.id]: { selected: true, replacement: 'Public' }
	};
	const fixed = applyReviewFixes(markdown, [warning, blocking], selections);
	assert.match(fixed, /title: Public/);
	assert.match(fixed, /Use workspace here/);
	assert.match(markdown, /title: Safe/);

	const duplicateMarkdown = 'secret secret';
	const duplicate = createReviewIssue({ exactText: 'secret' });
	assert.equal(validateReviewFixes(duplicateMarkdown, [duplicate], {
		[duplicate.id]: { selected: true, replacement: 'x' }
	})?.code, 'target-not-unique');

	const outer = createReviewIssue({ id: 'outer', exactText: 'token here' });
	const inner = createReviewIssue({ id: 'inner', exactText: 'token' });
	assert.equal(validateReviewFixes('token here', [outer, inner], {
		outer: { selected: true, replacement: 'safe' },
		inner: { selected: true, replacement: 'safe' }
	})?.code, 'overlapping-fixes');

	const invalidYaml = createReviewIssue({ exactText: 'title: Safe' });
	assert.throws(() => applyReviewFixes(markdown, [invalidYaml], {
		[invalidYaml.id]: { selected: true, replacement: 'title: [' }
	}));
}

function createReviewResponse(
	issues: unknown[],
	content: unknown = JSON.stringify({ issues })
): RequestUrlResponse {
	const body = {
		choices: [{ finish_reason: 'stop', message: { content } }]
	};
	return {
		status: 200,
		headers: {},
		arrayBuffer: new ArrayBuffer(0),
		json: body,
		text: JSON.stringify(body)
	};
}

async function testAiReviewClient(): Promise<void> {
	assert.match(buildReviewInstructions('zh'), /Simplified Chinese/);
	assert.match(buildReviewInstructions('zh-tw'), /Traditional Chinese/);
	assert.match(buildReviewInstructions('fr'), /locale code "fr"/);
	assert.match(buildReviewInstructions('zh'), /Do not translate exactText/);
	const requests: RequestUrlParam[] = [];
	const app = {
		secretStorage: { getSecret: (name: string) => name === 'hugo-exporter-key' ? 'test-key' : null }
	} as unknown as App;
	const settings = {
		aiBaseUrl: 'https://example.com/v1/',
		aiModel: 'test-model',
		aiSecretName: 'hugo-exporter-key'
	};
	const issue = createReviewIssue({ level: 'blocking' });
	const result = await reviewMarkdown(app, '# Final markdown', settings, async request => {
		assert.equal(typeof request, 'object');
		requests.push(request as RequestUrlParam);
		return createReviewResponse([issue]);
	});
	assert.equal(result.issues[0].level, 'warning');
	assert.equal(requests[0].url, 'https://example.com/v1/chat/completions');
	const payload = JSON.parse(requests[0].body as string) as {
		messages: Array<{ content: string }>;
		response_format: { type: string };
	};
	assert.equal(payload.messages[1].content, '# Final markdown');
	assert.match(payload.messages[0].content, /Return JSON only/);
	assert.match(payload.messages[0].content, /Write title, reason, and suggestedReplacement in English/);
	assert.equal(payload.response_format.type, 'json_object');
	assert.doesNotMatch(requests[0].body as string, /test-key/);

	let openAiAttempts = 0;
	await reviewMarkdown(app, '# OpenAI', {
		...settings,
		aiBaseUrl: 'https://api.openai.com/v1'
	}, async request => {
		openAiAttempts += 1;
		const openAiPayload = JSON.parse((request as RequestUrlParam).body as string) as {
			response_format: { type: string };
		};
		assert.equal(openAiPayload.response_format.type, 'json_schema');
		return createReviewResponse([]);
	});
	assert.equal(openAiAttempts, 1);

	let attempts = 0;
	await reviewMarkdown(app, '# Retry', settings, async request => {
		attempts += 1;
		if (attempts === 1) {
			return {
				status: 400,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				json: {},
				text: 'response_format json_object is unsupported'
			};
		}
		const fallbackPayload = JSON.parse((request as RequestUrlParam).body as string) as {
			response_format?: { type: string };
		};
		assert.equal(fallbackPayload.response_format, undefined);
		return createReviewResponse([]);
	});
	assert.equal(attempts, 2);

	const localRequests: RequestUrlParam[] = [];
	const localResult = await reviewMarkdown(app, '# Local', {
		...settings,
		aiBaseUrl: 'http://127.0.0.1:11434/v1/chat/completions',
		aiSecretName: ''
	}, async request => {
		localRequests.push(request as RequestUrlParam);
		return createReviewResponse([], [{ type: 'text', text: '```json\n{"issues":[]}\n```' }]);
	});
	assert.deepEqual(localResult, { issues: [] });
	assert.equal(localRequests[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
	assert.deepEqual(localRequests[0].headers, {});

	const wrappedResult = await reviewMarkdown(app, '# Wrapped', settings, async () =>
		createReviewResponse([], 'Here is the result:\n```json\n{"issues":[]}\n```\nDone.')
	);
	assert.deepEqual(wrappedResult, { issues: [] });

	let invalidAttempts = 0;
	const recoveredResult = await reviewMarkdown(app, '# Recover', settings, async () => {
		invalidAttempts += 1;
		return invalidAttempts === 1
			? createReviewResponse([], '{invalid json')
			: createReviewResponse([]);
	});
	assert.deepEqual(recoveredResult, { issues: [] });
	assert.equal(invalidAttempts, 2);

	for (const [status, code] of [
		[402, 'insufficient-balance'],
		[503, 'server']
	] as const) {
		await assert.rejects(
			reviewMarkdown(app, '# Error', settings, async () => ({
				status,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				json: {},
				text: ''
			})),
			(error: unknown) => error instanceof AiReviewError && error.code === code
		);
	}

	await assert.rejects(
		reviewMarkdown(app, '# Invalid', settings, async () => createReviewResponse([{}])),
		(error: unknown) => error instanceof AiReviewError && error.code === 'invalid-response'
	);
	await assert.rejects(
		reviewMarkdown(app, '# Missing', { ...settings, aiModel: '' }),
		(error: unknown) => error instanceof AiReviewError && error.code === 'missing-config'
	);
	await assert.rejects(
		reviewMarkdown(app, '# Timeout', settings, () => new Promise(() => undefined), 1),
		(error: unknown) => error instanceof AiReviewError && error.code === 'timeout'
	);
}

function createFakeProgress(): ProgressController {
	return {
		cancelled: new Promise<void>(() => undefined),
		open: () => undefined,
		finish: () => undefined,
		setStage: () => undefined,
		wasCancelled: () => false
	};
}

function createPreparedExport(overrides: Partial<PreparedExport> = {}): PreparedExport {
	return {
		parentDirectory: '/tmp/parent',
		claimedDirectory: {
			directoryPath: '/tmp/parent/article',
			directoryName: 'article',
			suffix: 0
		},
		markdown: '---\ntitle: Safe\n---\n\nBody',
		assets: [],
		warnings: [],
		metadataReports: [],
		...overrides
	};
}

function createWorkflowDependencies(
	prepared: PreparedExport,
	overrides: Partial<ExportWorkflowDependencies> = {}
): ExportWorkflowDependencies {
	return {
		prepare: async () => prepared,
		commit: async (): Promise<ExportResult> => ({
			directoryName: prepared.claimedDirectory.directoryName,
			warnings: [],
			metadataReports: prepared.metadataReports
		}),
		discard: async () => undefined,
		review: async () => ({ issues: [] }),
		createProgress: () => createFakeProgress(),
		showReview: async () => ({ selections: {} }),
		showError: async () => 'cancel',
		...overrides
	};
}

async function testExportWorkflowBoundaries(): Promise<void> {
	const prepared = createPreparedExport();
	const file = createRuntimeTFile({ name: 'article.md' });
	const app = {} as App;
	const settings: ObsidianHugoExporterSettings = {
		hugoPath: '/tmp/hugo',
		contentPath: 'content/posts',
		replacementRules: [],
		aiReviewEnabled: false,
		aiBaseUrl: 'https://example.com/v1',
		aiModel: 'model',
		aiSecretName: 'secret'
	};

	let reviewCalls = 0;
	let committedMarkdown = '';
	let discardCalls = 0;
	let dependencies = createWorkflowDependencies(prepared, {
		review: async () => {
			reviewCalls += 1;
			return { issues: [] };
		},
		commit: async (_value, markdown) => {
			committedMarkdown = markdown ?? prepared.markdown;
			return { directoryName: 'article', warnings: [], metadataReports: [] };
		},
		discard: async () => {
			discardCalls += 1;
		}
	});
	const direct = await runExportWorkflow(app, file, settings, {
		openSettings: () => undefined,
		dependencies
	});
	assert.equal(direct?.directoryName, 'article');
	assert.equal(reviewCalls, 0);
	assert.equal(committedMarkdown, prepared.markdown);
	assert.equal(discardCalls, 0);

	const warning = createReviewIssue({ exactText: 'Body' });
	dependencies = createWorkflowDependencies(prepared, {
		review: async () => ({ issues: [warning] }),
		showReview: async () => ({
			selections: { [warning.id]: { selected: true, replacement: 'Public body' } }
		}),
		commit: async (_value, markdown) => {
			committedMarkdown = markdown ?? prepared.markdown;
			return { directoryName: 'article', warnings: [], metadataReports: [] };
		}
	});
	await runExportWorkflow(app, file, { ...settings, aiReviewEnabled: true }, {
		openSettings: () => undefined,
		dependencies
	});
	assert.match(committedMarkdown, /Public body/);

	discardCalls = 0;
	dependencies = createWorkflowDependencies(prepared, {
		review: async () => {
			throw new AiReviewError('network');
		},
		showError: async () => 'cancel',
		discard: async () => {
			discardCalls += 1;
		}
	});
	const cancelled = await runExportWorkflow(app, file, { ...settings, aiReviewEnabled: true }, {
		openSettings: () => undefined,
		dependencies
	});
	assert.equal(cancelled, null);
	assert.equal(discardCalls, 1);

	dependencies = createWorkflowDependencies(prepared, {
		review: async () => {
			throw new AiReviewError('network');
		},
		showError: async () => 'cancel',
		discard: async () => {
			throw new Error('cleanup failed');
		}
	});
	await assert.rejects(
		runExportWorkflow(app, file, { ...settings, aiReviewEnabled: true }, {
			openSettings: () => undefined,
			dependencies
		}),
		(error: unknown) => error instanceof ExportRollbackError
	);
}

async function testAiSettingConfirmation(): Promise<void> {
	const settings: ObsidianHugoExporterSettings = {
		hugoPath: '/tmp/hugo',
		contentPath: 'content/posts',
		replacementRules: [],
		aiReviewEnabled: true,
		aiBaseUrl: 'https://example.com/v1',
		aiModel: 'model',
		aiSecretName: 'secret'
	};
	let saveCount = 0;
	let confirmCount = 0;
	const rejected = await applySettingControlChange(
		settings,
		'aiReviewEnabled',
		false,
		async () => { saveCount += 1; },
		async () => { confirmCount += 1; return false; }
	);
	assert.equal(rejected, false);
	assert.equal(settings.aiReviewEnabled, true);
	assert.equal(saveCount, 0);
	assert.equal(confirmCount, 1);

	const accepted = await applySettingControlChange(
		settings,
		'aiReviewEnabled',
		false,
		async () => { saveCount += 1; },
		async () => { confirmCount += 1; return true; }
	);
	assert.equal(accepted, true);
	assert.equal(settings.aiReviewEnabled, false);
	assert.equal(saveCount, 1);
	assert.equal(confirmCount, 2);
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
		replacementRules: [{ from: 'Body', to: 'Text' }],
		aiReviewEnabled: true,
		aiBaseUrl: 'https://api.openai.com/v1',
		aiModel: '',
		aiSecretName: ''
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
	await testMetadataCleaning();
	await testPreparedImageDeduplication();
	testReviewFixes();
	await testAiReviewClient();
	await testExportWorkflowBoundaries();
	await testAiSettingConfirmation();
	testPathValidation();
	await testDirectoryClaims();
	await testSafeBundleWriting();
	await testCompleteExport();
	await testLocaleParity();
}

void run();
