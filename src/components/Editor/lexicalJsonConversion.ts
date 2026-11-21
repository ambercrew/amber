import { $generateNodesFromSerializedNodes } from "@lexical/clipboard";
import {
	buildEditorFromExtensions,
	configExtension,
	defineExtension,
} from "@lexical/extension";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $dfs } from "@lexical/utils";
import {
	$getRoot,
	$insertNodes,
	$setSelection,
	type HTMLConfig,
	type LexicalEditor,
} from "lexical";
import { markdownToHtml } from "../../utils/markdownToHtml";
import { sanitizeHtml } from "../../utils/sanitizeHtml";
import {
	editorExtensionDependencies,
	editorNodes,
	editorTheme,
} from "./editorExtension";
import {
	CodeHighlightExtension,
	stripCodeThemes,
} from "./plugins/CodeHighlightPlugin/CodeHighlightExtension";
import { $isClozeHiddenNode } from "./plugins/ClozePlugin/ClozeHiddenNode";
import { EquationNode } from "./plugins/EquationPlugin/EquationNode";

// Stand-in for @lexical/clipboard's non-exported `BaseSerializedNode`.
export interface SerializedLexicalNodeTree {
	type: string;
	version: number;
	children?: SerializedLexicalNodeTree[];
	[key: string]: unknown;
}

function buildHeadlessEditor(name: string, html?: HTMLConfig) {
	return buildEditorFromExtensions(
		defineExtension({
			name,
			namespace: "headless",
			nodes: editorNodes,
			dependencies: [
				...editorExtensionDependencies,
				// Highlighting each code block with Shiki made converting code-heavy imports many times slower.
				configExtension(CodeHighlightExtension, { disabled: true }),
			],
			theme: editorTheme,
			html,
		}),
	);
}

export function runHeadless(populate: (editor: LexicalEditor) => void): string {
	const editor = buildHeadlessEditor("headless-lexical-json");

	editor.update(() => populate(editor), { discrete: true });

	const json = JSON.stringify(
		editor.getEditorState().toJSON(),
		stripCodeThemes,
	);
	editor.dispose();
	return json;
}

/** The plain text of a serialized Lexical editor state, e.g. a card side to hand the AI. */
export function lexicalJsonToText(json: string): string {
	// An empty side, such as a cloze card's back, is stored as "", which isn't JSON.
	if (json.trim() === "") return "";
	const editor = buildHeadlessEditor("headless-lexical-text");
	try {
		editor.setEditorState(editor.parseEditorState(json));
		// Spells out each cloze's hidden phrase in the AI's cloze syntax, as its placeholder hides the answer.
		editor.update(
			() => {
				for (const { node } of $dfs()) {
					if ($isClozeHiddenNode(node))
						node.setTextContent(`{{${node.getHiddenText()}}}`);
				}
			},
			{ discrete: true },
		);
		return editor
			.getEditorState()
			.read(() => $getRoot().getTextContent())
			.trim();
	} finally {
		editor.dispose();
	}
}

/** Converts sanitized HTML into serialized Lexical editor state JSON. */
export function htmlToLexicalJson(html: string): string {
	return domToLexicalJson(new DOMParser().parseFromString(html, "text/html"));
}

/** `htmlToLexicalJson` for already parsed, sanitized HTML, e.g. a body built up in place. */
export function domToLexicalJson(dom: Document | ParentNode): string {
	return runHeadless(editor => {
		$insertNodes($generateNodesFromDOM(editor, dom));
	});
}

/** Converts Markdown (TeX math included) into serialized Lexical editor state JSON. */
export function markdownToLexicalJson(markdown: string): string {
	const html = markdownToHtml(markdown);
	return htmlToLexicalJson(sanitizeHtml(html));
}

/**
 * Turns serialized nodes (e.g. from `$generateJSONFromSelectedNodes`) into a standalone editor state;
 * `mutate` can edit the tree with `$` APIs before it's serialized.
 */
export function serializedNodesToLexicalJson(
	nodes: SerializedLexicalNodeTree[],
	mutate?: () => void,
): string {
	return runHeadless(() => {
		$insertNodes($generateNodesFromSerializedNodes(nodes));
		// Clear the post-insert selection so `mutate` can freely remove/replace nodes.
		$setSelection(null);
		mutate?.();
	});
}

/**
 * Renders serialized Lexical editor states as HTML, e.g. for Anki, sharing one editor.
 * Equations become MathJax delimiters, which Anki typesets itself.
 */
export function lexicalJsonsToHtml(jsons: string[]): string[] {
	const editor = buildHeadlessEditor("headless-lexical-html", {
		export: new Map([
			[
				EquationNode,
				(_editor, node) => {
					const equation = node as EquationNode;
					const element = document.createElement("span");
					element.textContent = equation.__display
						? `\\[${equation.getEquation()}\\]`
						: `\\(${equation.getEquation()}\\)`;
					return { element };
				},
			],
		]),
	});
	const htmls = jsons.map(json => {
		if (!json.trim()) return "";
		editor.setEditorState(editor.parseEditorState(json));
		return editor
			.getEditorState()
			.read(() => $generateHtmlFromNodes(editor, null));
	});
	editor.dispose();
	return htmls;
}
