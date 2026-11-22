import { $isElementNode, $isTextNode, LexicalNode, TextNode } from "lexical";

// Keep in step with `BLOCK_NODE_TYPES` in `plain_text_extractor.rs`, so both sides count
// matches in the same string.
const BLOCK_NODE_TYPES = new Set(["paragraph", "heading", "listitem", "quote"]);

export interface OffsetMapEntry {
	node: TextNode;
	start: number;
	end: number;
}

export interface OffsetMap {
	text: string;
	entries: OffsetMapEntry[];
}

export function buildOffsetMap(root: LexicalNode): OffsetMap {
	const entries: OffsetMapEntry[] = [];
	let text = "";

	const walk = (node: LexicalNode) => {
		if ($isTextNode(node)) {
			const start = text.length;
			text += node.getTextContent();
			entries.push({ node, start, end: text.length });
			return;
		}
		if ($isElementNode(node)) {
			for (const child of node.getChildren()) {
				walk(child);
			}
			if (BLOCK_NODE_TYPES.has(node.getType())) {
				text += "\n";
			}
		}
	};

	walk(root);
	// Mirrors the backend's `.trim()`: strips the trailing block separator.
	return { text: text.replace(/\n+$/, ""), entries };
}

export interface OffsetPoint {
	node: TextNode;
	offset: number;
}

/**
 * Resolves a plain-text character offset (as produced by `buildOffsetMap`)
 * to the text node and local offset it falls within.
 */
export function offsetToPoint(
	entries: OffsetMapEntry[],
	charOffset: number,
): OffsetPoint | null {
	for (const entry of entries) {
		if (charOffset >= entry.start && charOffset <= entry.end) {
			return { node: entry.node, offset: charOffset - entry.start };
		}
	}
	return null;
}
