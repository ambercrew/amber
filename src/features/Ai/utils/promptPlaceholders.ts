export interface TextRange {
	start: number;
	end: number;
}

// `{topic}` on one line; `{{...}}` isn't one, so text meant to hold braces is left alone.
const PLACEHOLDER = /(?<!\{)\{[^{}\n]+\}(?!\})/g;

/** Every `{placeholder}` in the text, in order. */
export function findPlaceholders(text: string): TextRange[] {
	return [...text.matchAll(PLACEHOLDER)].map(match => ({
		start: match.index,
		end: match.index + match[0].length,
	}));
}

/**
 * The placeholder Tab (or Shift+Tab, `backward`) moves to from the selection: the next one past
 * it, or the one a bare caret sits inside. `null` leaves the key to the browser.
 */
export function adjacentPlaceholder(
	text: string,
	selection: TextRange,
	backward: boolean,
): TextRange | null {
	const placeholders = findPlaceholders(text);
	const caret = selection.start === selection.end ? selection.start : null;
	const surrounds = (p: TextRange) =>
		caret !== null && p.start < caret && caret < p.end;
	if (backward) {
		return (
			[...placeholders]
				.reverse()
				.find(p => p.end <= selection.start || surrounds(p)) ?? null
		);
	}
	return (
		placeholders.find(p => p.start >= selection.end || surrounds(p)) ?? null
	);
}
