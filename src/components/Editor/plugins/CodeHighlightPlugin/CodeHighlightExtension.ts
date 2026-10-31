import {
	$createCodeHighlightNode,
	$isCodeHighlightNode,
	$isCodeNode,
	CodeHighlightNode,
	CodeNode,
	DEFAULT_CODE_LANGUAGE,
} from "@lexical/code-core";
import {
	CodeShikiExtension,
	isCodeLanguageLoaded,
	loadCodeLanguage,
	loadCodeTheme,
	ShikiTokenizer,
} from "@lexical/code-shiki";
import {
	$createTextNode,
	$findMatchingParent,
	$getNodeByKey,
	$getSelection,
	$isElementNode,
	$isLineBreakNode,
	$isRangeSelection,
	$isTabNode,
	$isTextNode,
	$onUpdate,
	configExtension,
	defineExtension,
	type ElementNode,
	type LexicalEditor,
	type LexicalNode,
	mergeRegister,
	type NodeKey,
	type PointType,
	safeCast,
	TextNode,
} from "lexical";
import { ClozeHiddenNode } from "../ClozePlugin/ClozeHiddenNode";

// Upstream's Shiki highlighter swaps a code block's children for flat tokens,
// dropping highlight marks; this one keeps inline wrappers and cloze nodes.

interface Leaf {
	node: LexicalNode;
	/** Inline elements between the leaf and the code node, outermost first. */
	wrappers: ElementNode[];
	/** The wrappers' keys, joined, to compare leaves' placement cheaply. */
	path: string;
}

/** Leaves re-tokenizing must not replace, e.g. a cloze's hidden text. */
function $isKeptLeaf(node: LexicalNode): boolean {
	return !(
		$isCodeHighlightNode(node) ||
		$isLineBreakNode(node) ||
		$isTabNode(node) ||
		($isTextNode(node) && node.getType() === "text")
	);
}

function $collectLeaves(
	parent: ElementNode,
	wrappers: ElementNode[] = [],
	path = "",
): Leaf[] {
	return parent.getChildren().flatMap((child): Leaf[] => {
		if (!$isElementNode(child)) return [{ node: child, wrappers, path }];
		return $collectLeaves(
			child,
			[...wrappers, child],
			`${path}/${child.getKey()}`,
		);
	});
}

function $signature({ node, path }: Leaf): string {
	if ($isKeptLeaf(node)) return `${path}:${node.getKey()}`;
	const type = $isCodeHighlightNode(node) ? node.getHighlightType() : "";
	const style = $isTextNode(node) ? node.getStyle() : "";
	return `${path}:${node.getType()}|${type}|${style}|${node.getTextContent()}`;
}

/** Splits the flat tokens along the current wrapper and kept-leaf boundaries. */
function $distributeTokens(current: Leaf[], tokens: LexicalNode[]): Leaf[] {
	const queue = [...tokens];
	const next: Leaf[] = [];
	// A null `at` drops the taken tokens.
	const $take = (count: number, at: Omit<Leaf, "node"> | null) => {
		for (let left = count; left > 0 && queue.length > 0;) {
			let token = queue.shift()!;
			const whole = token;
			if (
				$isCodeHighlightNode(whole) &&
				whole.getTextContentSize() > left
			) {
				const text = whole.getTextContent();
				const $piece = (part: string) =>
					$createCodeHighlightNode(
						part,
						whole.getHighlightType(),
					).setStyle(whole.getStyle());
				queue.unshift($piece(text.slice(left)));
				token = $piece(text.slice(0, left));
			}
			if (at) next.push({ ...at, node: token });
			left -= token.getTextContentSize();
		}
	};

	for (let i = 0; i < current.length;) {
		const leaf = current[i];
		if ($isKeptLeaf(leaf.node)) {
			next.push(current[i++]);
			$take(leaf.node.getTextContentSize(), null);
			continue;
		}
		let size = 0;
		for (
			;
			i < current.length &&
			!$isKeptLeaf(current[i].node) &&
			current[i].path === leaf.path;
			i++
		) {
			size += current[i].node.getTextContentSize();
		}
		$take(size, leaf);
	}
	$take(Infinity, { wrappers: [], path: "" });
	return next;
}

function $codeOffset(code: CodeNode, point: PointType): number | null {
	let node = point.getNode();
	if (!code.is(node) && !code.isParentOf(node)) return null;
	let offset = $isElementNode(node)
		? node
				.getChildren()
				.slice(0, point.offset)
				.reduce((sum, child) => sum + child.getTextContentSize(), 0)
		: point.offset;
	for (; !code.is(node); node = node.getParentOrThrow()) {
		for (const sibling of node.getPreviousSiblings()) {
			offset += sibling.getTextContentSize();
		}
	}
	return offset;
}

function $restorePoint(
	point: PointType,
	code: CodeNode,
	leaves: Leaf[],
	offset: number,
) {
	let left = offset;
	for (const { node } of leaves) {
		const size = node.getTextContentSize();
		// A caret on a kept leaf's edge goes beside it, so typing doesn't extend it.
		const inside = $isKeptLeaf(node)
			? left > 0 && left < size
			: left <= size;
		if ($isTextNode(node) && inside) {
			point.set(node.getKey(), left, "text");
			return;
		}
		if (left === 0) {
			point.set(
				node.getParentOrThrow().getKey(),
				node.getIndexWithinParent(),
				"element",
			);
			return;
		}
		left -= size;
	}
	point.set(code.getKey(), code.getChildrenSize(), "element");
}

function $prepend(parent: ElementNode, node: LexicalNode) {
	const first = parent.getFirstChild();
	if (first) first.insertBefore(node);
	else parent.append(node);
}

/** Replaces only the leaves that changed, like upstream's getDiffRange. */
function $splice(code: CodeNode, current: Leaf[], next: Leaf[]) {
	const sameAt = (i: number, j: number) =>
		$signature(current[i]) === $signature(next[j]);
	const shortest = Math.min(current.length, next.length);
	let from = 0;
	while (from < shortest && sameAt(from, from)) from++;
	let trailing = 0;
	while (
		trailing < shortest - from &&
		sameAt(current.length - 1 - trailing, next.length - 1 - trailing)
	) {
		trailing++;
	}
	const removed = current.slice(from, current.length - trailing);
	const inserted = next.slice(from, next.length - trailing);
	if (removed.length === 0 && inserted.length === 0) return;

	const selection = $getSelection();
	const points = $isRangeSelection(selection)
		? [selection.anchor, selection.focus].map(point => ({
				point,
				key: point.key,
				offset: point.offset,
				type: point.type,
				codeOffset: $codeOffset(code, point),
			}))
		: [];

	// Wrappers stay attached so the inserted leaves can go back into them.
	for (const { node } of removed) node.remove(true);
	let previous: Leaf | undefined = current[from - 1];
	for (const leaf of inserted) {
		const { node, wrappers } = leaf;
		let depth = 0;
		while (
			previous &&
			depth < previous.wrappers.length &&
			depth < wrappers.length &&
			previous.wrappers[depth].is(wrappers[depth])
		) {
			depth++;
		}
		if (previous && depth === wrappers.length) {
			(previous.wrappers[depth] ?? previous.node).insertAfter(node);
		} else {
			$prepend(wrappers[wrappers.length - 1] ?? code, node);
		}
		previous = leaf;
	}

	const leaves = [
		...current.slice(0, from),
		...inserted,
		...current.slice(current.length - trailing),
	];
	for (const { point, key, offset, type, codeOffset } of points) {
		if (type === "text" && $getNodeByKey(key)?.isAttached()) {
			point.set(key, offset, type);
		} else if (codeOffset !== null) {
			$restorePoint(point, code, leaves, codeOffset);
		}
	}
}

function $highlight(
	editor: LexicalEditor,
	theme: string,
	highlighting: Set<NodeKey>,
	code: CodeNode,
) {
	const key = code.getKey();
	if (highlighting.has(key)) return;

	const language = code.getLanguage() ?? DEFAULT_CODE_LANGUAGE;
	if (code.getLanguage() !== language) code.setLanguage(language);
	if (code.getTheme() !== theme) code.setTheme(theme);
	const supported = isCodeLanguageLoaded(language);
	if (code.getIsSyntaxHighlightSupported() !== supported) {
		code.setIsSyntaxHighlightSupported(supported);
	}
	// Both loaders re-run this transform once done; unknown languages stay plain.
	const loadingTheme = loadCodeTheme(theme, editor, key);
	const loadingLanguage = loadCodeLanguage(language, editor, key);
	if (loadingTheme || loadingLanguage || !supported) return;

	if (highlighting.size === 0) $onUpdate(() => highlighting.clear());
	highlighting.add(key);

	const current = $collectLeaves(code);
	$splice(
		code,
		current,
		$distributeTokens(current, ShikiTokenizer.$tokenize(code, language)),
	);
}

/** Shiki syntax highlighting that leaves highlight marks in code blocks intact. */
export const CodeHighlightExtension = defineExtension({
	name: "amber/code-highlight",
	config: safeCast<{ theme: string }>({ theme: "gruvbox-light-soft" }),
	nodes: [ClozeHiddenNode],
	// Upstream's highlighting stays off; it still provides the nodes and indentation.
	dependencies: [configExtension(CodeShikiExtension, { disabled: true })],
	register: (editor, { theme }) => {
		const highlighting = new Set<NodeKey>();
		const $highlightCode = (code: CodeNode) =>
			$highlight(editor, theme, highlighting, code);
		const $textTransform = (node: TextNode) => {
			const code = $findMatchingParent(node, $isCodeNode);
			if (code) $highlightCode(code);
			// Tokens left over from a code block turned into a paragraph.
			else if ($isCodeHighlightNode(node))
				node.replace($createTextNode(node.getTextContent()));
		};
		return mergeRegister(
			editor.registerNodeTransform(CodeNode, $highlightCode),
			editor.registerNodeTransform(TextNode, $textTransform),
			editor.registerNodeTransform(CodeHighlightNode, $textTransform),
			editor.registerNodeTransform(ClozeHiddenNode, $textTransform),
		);
	},
});

/**
 * JSON.stringify replacer dropping the Shiki theme and its colors from code
 * blocks; they depend on the device's color scheme and are re-highlighted on load.
 */
export function stripCodeThemes(this: unknown, key: string, value: unknown) {
	const type = (this as { type?: unknown } | null)?.type;
	if (type !== "code" && type !== "code-highlight") return value;
	if (key === "style") return "";
	return type === "code" && key === "theme" ? undefined : value;
}
