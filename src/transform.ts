import type { ReplacementRule } from './settings';

export function applyReplacements(value: string, rules: ReplacementRule[]): string {
	return rules.reduce((result, rule) => {
		if (!rule.from) {
			return result;
		}
		return result.split(rule.from).join(rule.to);
	}, value);
}

export function replaceStringValues(value: unknown, rules: ReplacementRule[]): unknown {
	if (typeof value === 'string') {
		return applyReplacements(value, rules);
	}
	if (Array.isArray(value)) {
		return value.map(item => replaceStringValues(item, rules));
	}
	if (value !== null && typeof value === 'object') {
		const source = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(source)) {
			result[key] = replaceStringValues(source[key], rules);
		}
		return result;
	}
	return value;
}

export function stripDatePrefix(fileName: string): string {
	const match = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(fileName);
	if (!match) {
		return fileName;
	}

	const [, dateText, title] = match;
	const date = new Date(`${dateText}T00:00:00Z`);
	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
		return fileName;
	}

	const trimmedTitle = title.trim();
	return trimmedTitle || fileName;
}

export function findMarkdownBodyOffset(rawContent: string): number {
	const frontmatter = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(rawContent);
	return frontmatter ? frontmatter[0].length : 0;
}

function padDatePart(value: number): string {
	return String(value).padStart(2, '0');
}

export function formatExportDate(value: unknown, fallbackTimestamp: number): string {
	let date: Date;
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [year, month, day] = value.split('-').map(Number);
		date = new Date(year, month - 1, day);
	} else if (typeof value === 'string' || typeof value === 'number') {
		date = new Date(value);
	} else {
		date = new Date(fallbackTimestamp);
	}

	if (Number.isNaN(date.getTime())) {
		date = new Date(fallbackTimestamp);
	}

	const offsetMinutes = -date.getTimezoneOffset();
	const offsetSign = offsetMinutes >= 0 ? '+' : '-';
	const absoluteOffset = Math.abs(offsetMinutes);
	return [
		`${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
		`T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`,
		`${offsetSign}${padDatePart(Math.floor(absoluteOffset / 60))}:${padDatePart(absoluteOffset % 60)}`
	].join('');
}

export function isSafeExportName(name: string): boolean {
	const trimmed = name.trim();
	const hasControlCharacter = Array.from(name).some(character => character.charCodeAt(0) <= 31);
	if (
		trimmed.length === 0
		|| trimmed === '.'
		|| trimmed === '..'
		|| name !== name.trimEnd()
		|| name.endsWith('.')
		|| hasControlCharacter
		|| /[<>:"/\\|?*]/.test(name)
	) {
		return false;
	}

	return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(trimmed);
}

export function convertWikiLinks(markdown: string): string {
	return markdown.replace(/(^|[^!])\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (
		_match,
		prefix: string,
		linkTarget: string,
		alias?: string
	) => {
		const displayText = alias || linkTarget;
		return `${prefix}[${displayText}](../${encodeURI(linkTarget)}/)`;
	});
}

export interface TextRangeReplacement {
	start: number;
	end: number;
	markdown: string;
}

export function transformBodyWithImages(
	rawContent: string,
	bodyStartOffset: number,
	replacements: TextRangeReplacement[],
	rules: ReplacementRule[]
): string {
	const body = rawContent.substring(bodyStartOffset);
	const applicable = replacements
		.filter(item => item.start >= bodyStartOffset)
		.sort((left, right) => left.start - right.start);

	let cursor = 0;
	let transformed = '';
	const imageMarkdown: string[] = [];

	for (const replacement of applicable) {
		const start = replacement.start - bodyStartOffset;
		const end = replacement.end - bodyStartOffset;
		if (start < cursor || start > body.length || end > body.length) {
			continue;
		}
		transformed += body.slice(cursor, start);
		transformed += `\uE000HUGO_IMAGE_${imageMarkdown.length}\uE001`;
		imageMarkdown.push(replacement.markdown);
		cursor = end;
	}
	transformed += body.slice(cursor);

	transformed = applyReplacements(transformed, rules);
	transformed = transformed.replace(/\uE000HUGO_IMAGE_(\d+)\uE001/g, (_match, index: string) => {
		return imageMarkdown[Number(index)] || '';
	});
	return transformed.trim();
}
