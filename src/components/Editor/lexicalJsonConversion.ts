import { $generateNodesFromSerializedNodes } from "@lexical/clipboard";
import {
	buildEditorFromExtensions,
	configExtension,
	defineExtension,
} from "@lexical/extension";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import {
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
 * Converts serialized Lexical nodes (e.g. from `$generateJSONFromSelectedNodes`)
 * into standalone serialized editor state JSON. `mutate` runs after insertion
 * and can further edit the tree via `$` node APIs before it's serialized.
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
