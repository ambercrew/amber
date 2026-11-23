import {
	CODE,
	INLINE_CODE,
	registerMarkdownShortcuts,
} from "@lexical/markdown";
import { defineExtension } from "lexical";
import { CodeHighlightExtension } from "../CodeHighlightPlugin/CodeHighlightExtension";

/** Markdown-style code shortcuts: `text` becomes inline code, ```lang plus space or Enter a code block. */
export const CodeShortcutsExtension = defineExtension({
	name: "amber/code-shortcuts",
	dependencies: [CodeHighlightExtension],
	register: editor => registerMarkdownShortcuts(editor, [CODE, INLINE_CODE]),
});
