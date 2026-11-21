/**
 * Splits are bounded by a top-level block budget, not pages or chapters (which break mid-paragraph or
 * grow unbounded), preferring a nearby heading and never breaking inside a block.
 */
const MAX_BLOCKS = 200;
const HEADING_LOOKAHEAD = 50;
const TARGET_BLOCKS = MAX_BLOCKS - HEADING_LOOKAHEAD;
const HEADING_TAGS = new Set(["H1", "H2", "H3"]);

/** Splits normalized HTML into per-split HTML strings along top-level block boundaries. */
export function splitContent(html: string): string[] {
	const doc = new DOMParser().parseFromString(html, "text/html");
	const blocks = Array.from(doc.body.children);
	if (blocks.length === 0) return [html];

	const splits: string[] = [];
	let start = 0;
	while (start < blocks.length) {
		const end = findSplitEnd(blocks, start);
		splits.push(
			blocks
				.slice(start, end)
				.map(block => block.outerHTML)
				.join(""),
		);
		start = end;
	}
	return splits;
}

function findSplitEnd(blocks: Element[], start: number): number {
	const total = blocks.length;
	const windowStart = start + TARGET_BLOCKS;
	if (windowStart >= total) return total;

	const windowEnd = Math.min(windowStart + HEADING_LOOKAHEAD, total);
	for (let i = windowStart; i < windowEnd; i++) {
		if (HEADING_TAGS.has(blocks[i].tagName.toUpperCase())) return i;
	}

	const hardCap = start + MAX_BLOCKS;
	return hardCap < total ? hardCap : total;
}
