import {
	ClickAfterLastBlockExtension,
	SelectBlockExtension,
	TabIndentationExtension,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { RichTextExtension } from "@lexical/rich-text";
import { TableExtension } from "@lexical/table";
import { CodeHighlightExtension } from "./plugins/CodeHighlightPlugin/CodeHighlightExtension";
import { ClozeHiddenNode } from "./plugins/ClozePlugin/ClozeHiddenNode";
import { EquationNode } from "./plugins/EquationPlugin/EquationNode";
import { HighlightNode } from "./plugins/HighlightPlugin/HighlightNode";
import { ImageNode } from "./plugins/ImagePlugin/ImageNode";
import styles from "./Editor.module.css";

/**
 * Custom node types and extension dependencies shared by the interactive
 * editor (Editor.tsx) and the headless HTML-to-JSON converter used by
 * Import, so both parse the same set of node types from HTML/JSON.
 */
export const editorNodes = [
	EquationNode,
	HighlightNode,
	ClozeHiddenNode,
	ImageNode,
];

/**
 * Static portion of the editor theme, shared by the interactive editor
 * (Editor.tsx) and the headless HTML/JSON converter — TableExtension warns
 * if a table-scrollable editor is built without `tableScrollableWrapper` set.
 */
export const editorTheme = {
	tableScrollableWrapper: styles["table-scrollable-wrapper"],
	tableCellHeader: styles["table-cell-header"],
};

export const editorExtensionDependencies = [
	RichTextExtension,
	HistoryExtension,
	LinkExtension,
	ListExtension,
	TableExtension,
	TabIndentationExtension,
	ClickAfterLastBlockExtension,
	SelectBlockExtension,
	// Editor.tsx sets its theme to match the color scheme.
	CodeHighlightExtension,
];
