import {
	$getNodeByKey,
	$getSelection,
	$hasUpdateTag,
	$isRangeSelection,
	$isTextNode,
	defineExtension,
	HISTORIC_TAG,
	HISTORY_MERGE_TAG,
	type LexicalEditor,
	mergeRegister,
	PASTE_TAG,
	TextNode,
} from "lexical";
import { $createEquationNode, EquationNode } from "./EquationNode";
import {
	BRACKET_SOURCE,
	DISPLAY_DOLLAR_SOURCE,
	INLINE_DOLLAR_SOURCE,
	PAREN_SOURCE,
} from "./equationSyntax";

// Each syntax has one capture group, so the matched group says which it was.
const SYNTAXES: [source: string, display: boolean][] = [
	[DISPLAY_DOLLAR_SOURCE, true],
	[INLINE_DOLLAR_SOURCE, false],
	[BRACKET_SOURCE, true],
	[PAREN_SOURCE, false],
];

// Never starts on an escaped delimiter or the second `$` of `$$`.
const EQUATION_REGEX = new RegExp(
	`(?<![$\\\\])(?:${SYNTAXES.map(([source]) => source).join("|")})`,
);

// Code and regex snippets are full of `$` and `\(`.
function $isInCode(node: TextNode): boolean {
	return node.hasFormat("code") || node.getParent()?.getType() === "code";
}

function $isCaretIn(node: TextNode): boolean {
	const selection = $getSelection();
	return (
		$isRangeSelection(selection) && selection.anchor.key === node.getKey()
	);
}

// The caret sits right after a `$` the next keystroke may rule out, as in `$5-$10`.
function $isCaretAt(node: TextNode, offset: number): boolean {
	const selection = $getSelection();
	return (
		$isRangeSelection(selection) &&
		selection.isCollapsed() &&
		selection.anchor.key === node.getKey() &&
		selection.anchor.offset === offset
	);
}

function $convertEquations(node: TextNode, deferAtCaret: boolean) {
	let current: TextNode | undefined = node;
	while (current) {
		const text = current.getTextContent();
		const match = EQUATION_REGEX.exec(text);
		if (!match) return;

		const [fullMatch, ...groups] = match;
		const syntaxIndex = groups.findIndex(group => group !== undefined);
		const [source, display] = SYNTAXES[syntaxIndex];
		const start = match.index;
		const end = start + fullMatch.length;
		if (
			deferAtCaret &&
			source === INLINE_DOLLAR_SOURCE &&
			end === text.length &&
			$isCaretAt(current, end)
		)
			return;

		let target: TextNode = current;
		let rest: TextNode | undefined;
		if (start === 0 && end < text.length)
			[target, rest] = current.splitText(end);
		else if (start > 0 && end < text.length)
			[, target, rest] = current.splitText(start, end);
		else if (start > 0) [, target] = current.splitText(start);
		target.replace(
			$createEquationNode(groups[syntaxIndex].trim(), display),
		);
		current = rest;
	}
}

// Only text being typed or pasted converts, so stored text (an escaped `\$x\$`, say) stays as written.
function $transformTextToEquation(node: TextNode) {
	if ($isInCode(node) || $hasUpdateTag(HISTORIC_TAG)) return;
	if (!$hasUpdateTag(PASTE_TAG) && !$isCaretIn(node)) return;
	$convertEquations(node, true);
}

function $caretPosition(): string | null {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
	return `${selection.anchor.key}:${selection.anchor.offset}`;
}

// A `$…$` deferred while the caret sat after it converts once the caret moves (Enter, click away).
function registerCaretMove(editor: LexicalEditor) {
	return editor.registerUpdateListener(
		({ editorState, prevEditorState, tags }) => {
			if (tags.has(HISTORIC_TAG)) return;
			const prevCaret = prevEditorState.read($caretPosition);
			if (prevCaret === null) return;
			if (prevCaret === editorState.read($caretPosition)) return;

			const prevKey = prevCaret.slice(0, prevCaret.lastIndexOf(":"));
			const hasMatch = editorState.read(() => {
				const node = $getNodeByKey(prevKey);
				return (
					$isTextNode(node) &&
					!$isInCode(node) &&
					EQUATION_REGEX.test(node.getTextContent())
				);
			});
			if (!hasMatch) return;
			editor.update(
				() => {
					const node = $getNodeByKey(prevKey);
					if ($isTextNode(node)) $convertEquations(node, true);
				},
				{ tag: HISTORY_MERGE_TAG },
			);
		},
	);
}

/** Turns `$…$`, `$$…$$`, `\(…\)` and `\[…\]` typed or pasted as plain text into equation nodes. */
export const EquationExtension = defineExtension({
	name: "@amber/equation",
	nodes: [EquationNode],
	register: editor =>
		mergeRegister(
			editor.registerNodeTransform(TextNode, $transformTextToEquation),
			registerCaretMove(editor),
		),
});
