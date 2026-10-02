import { $generateNodesFromSerializedNodes } from "@lexical/clipboard";
import { buildEditorFromExtensions, defineExtension } from "@lexical/extension";
import { $generateNodesFromDOM } from "@lexical/html";
import { $insertNodes, $setSelection, type LexicalEditor } from "lexical";
import { markdownToHtml } from "../../utils/markdownToHtml";
import { sanitizeHtml } from "../../utils/sanitizeHtml";
import {
	editorExtensionDependencies,
	editorNodes,
	editorTheme,
} from "./editorExtension";

// Stand-in for @lexical/clipboard's non-exported `BaseSerializedNode`.
export interface SerializedLexicalNodeTree {
	type: string;
	version: number;
	children?: SerializedLexicalNodeTree[];
	[key: string]: unknown;
}

function runHeadless(populate: (editor: LexicalEditor) => void): string {
	const editor = buildEditorFromExtensions(
		defineExtension({
			name: "headless-lexical-json",
			namespace: "headless",
			nodes: editorNodes,
			dependencies: editorExtensionDependencies,
			theme: editorTheme,
		}),
	);

	editor.update(() => populate(editor), { discrete: true });

	const json = JSON.stringify(editor.getEditorState().toJSON());
	editor.dispose();
	return json;
}

/** Converts sanitized HTML into serialized Lexical editor state JSON. */
export function htmlToLexicalJson(html: string): string {
	return runHeadless(editor => {
		const parser = new DOMParser();
		const dom = parser.parseFromString(html, "text/html");
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
