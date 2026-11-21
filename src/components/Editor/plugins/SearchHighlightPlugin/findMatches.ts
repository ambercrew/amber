export interface TextMatch {
	start: number;
	end: number;
}

/**
 * Every literal occurrence of `query` in `text` (user input, not a regex), overlapping like the
 * browser's find in page ("aa" in "aaa" is two).
 */
export function findMatches(
	text: string,
	query: string,
	caseSensitive: boolean,
): TextMatch[] {
	if (!query) return [];

	const haystack = caseSensitive ? text : text.toLowerCase();
	const needle = caseSensitive ? query : query.toLowerCase();

	const matches: TextMatch[] = [];
	let fromIndex = 0;
	for (;;) {
		const index = haystack.indexOf(needle, fromIndex);
		if (index === -1) break;
		matches.push({ start: index, end: index + needle.length });
		fromIndex = index + 1;
	}
	return matches;
}
