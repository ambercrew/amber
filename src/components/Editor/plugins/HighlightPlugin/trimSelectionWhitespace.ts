import {
	$isElementNode,
	$isLineBreakNode,
	$isTextNode,
	type LexicalNode,
	type PointType,
	type RangeSelection,
	type TextNode,
} from "lexical";

interface TextPoint {
	node: TextNode;
	offset: number;
}

/** The [from, to) character range of `node` covered by the selection spanning `start`..`end`. */
function selectedRange(node: TextNode, start: PointType, end: PointType) {
	const from =
		start.type === "text" && start.key === node.getKey() ? start.offset : 0;
	const to =
		end.type === "text" && end.key === node.getKey()
			? end.offset
			: node.getTextContentSize();
	return [from, to] as const;
}

// Returns the first point found by `pick`, or null if a non-text leaf (e.g. an image) comes first.
function $findPoint(
	nodes: LexicalNode[],
	pick: (node: TextNode) => number | null,
): TextPoint | null {
	for (const node of nodes) {
		if ($isElementNode(node) || $isLineBreakNode(node)) continue;
		if (!$isTextNode(node)) return null;
		const offset = pick(node);
		if (offset !== null) return { node, offset };
	}
	return null;
}

/** Shrinks the selection so it starts and ends on a non-whitespace character. */
export function $trimSelectionWhitespace(selection: RangeSelection) {
	const [start, end] = selection.isBackward()
		? [selection.focus, selection.anchor]
		: [selection.anchor, selection.focus];
	const nodes = selection.getNodes();

	const newStart = $findPoint(nodes, node => {
		const [from, to] = selectedRange(node, start, end);
		const index = node.getTextContent().slice(from, to).search(/\S/);
		return index === -1 ? null : from + index;
	});
	const newEnd = $findPoint([...nodes].reverse(), node => {
		const [from, to] = selectedRange(node, start, end);
		const trimmed = node.getTextContent().slice(from, to).trimEnd();
		return trimmed.length === 0 ? null : from + trimmed.length;
	});
	if (newStart) start.set(newStart.node.getKey(), newStart.offset, "text");
	if (newEnd) end.set(newEnd.node.getKey(), newEnd.offset, "text");
}
