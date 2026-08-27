import { parseDocument } from 'yaml';
import type { ReviewIssue } from './ai-review';

export interface ReviewFixSelection {
	selected: boolean;
	replacement: string;
}

export type ReviewFixSelections = Record<string, ReviewFixSelection>;

export type ReviewFixErrorCode =
	| 'blocking-unresolved'
	| 'target-not-unique'
	| 'empty-replacement'
	| 'overlapping-fixes'
	| 'invalid-frontmatter';

export class ReviewFixError extends Error {
	constructor(readonly code: ReviewFixErrorCode, readonly issueId?: string) {
		super(code);
		this.name = 'ReviewFixError';
	}
}

interface LocatedFix {
	issueId: string;
	start: number;
	end: number;
	replacement: string;
}

export function locateUniqueText(markdown: string, exactText: string): { start: number; end: number } | null {
	const start = markdown.indexOf(exactText);
	if (start < 0 || markdown.indexOf(exactText, start + exactText.length) >= 0) {
		return null;
	}
	return { start, end: start + exactText.length };
}

function collectFixes(
	markdown: string,
	issues: ReviewIssue[],
	selections: ReviewFixSelections
): LocatedFix[] {
	const fixes: LocatedFix[] = [];
	for (const issue of issues) {
		const selection = selections[issue.id];
		if (issue.level === 'blocking' && !selection?.selected) {
			throw new ReviewFixError('blocking-unresolved', issue.id);
		}
		if (!selection?.selected) continue;
		if (!selection.replacement.trim()) {
			throw new ReviewFixError('empty-replacement', issue.id);
		}
		const location = locateUniqueText(markdown, issue.exactText);
		if (!location) {
			throw new ReviewFixError('target-not-unique', issue.id);
		}
		fixes.push({ issueId: issue.id, ...location, replacement: selection.replacement });
	}

	fixes.sort((left, right) => left.start - right.start);
	for (let index = 1; index < fixes.length; index += 1) {
		if (fixes[index].start < fixes[index - 1].end) {
			throw new ReviewFixError('overlapping-fixes', fixes[index].issueId);
		}
	}
	return fixes;
}

function validateFrontmatter(markdown: string): void {
	if (!markdown.startsWith('---\n')) return;
	const end = markdown.indexOf('\n---\n', 4);
	if (end < 0) {
		throw new ReviewFixError('invalid-frontmatter');
	}
	const document = parseDocument(markdown.slice(4, end));
	if (document.errors.length > 0) {
		throw new ReviewFixError('invalid-frontmatter');
	}
}

export function validateReviewFixes(
	markdown: string,
	issues: ReviewIssue[],
	selections: ReviewFixSelections
): ReviewFixError | null {
	try {
		collectFixes(markdown, issues, selections);
		return null;
	} catch (error) {
		if (error instanceof ReviewFixError) return error;
		throw error;
	}
}

export function applyReviewFixes(
	markdown: string,
	issues: ReviewIssue[],
	selections: ReviewFixSelections
): string {
	const fixes = collectFixes(markdown, issues, selections)
		.sort((left, right) => right.start - left.start);
	let result = markdown;
	for (const fix of fixes) {
		result = `${result.slice(0, fix.start)}${fix.replacement}${result.slice(fix.end)}`;
	}
	validateFrontmatter(result);
	return result;
}
