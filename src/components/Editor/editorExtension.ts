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
 * Node types and extension dependencies shared by the editor (Editor.tsx) and the headless converter,
 * so both parse the same nodes from HTML and JSON.
 */
export const editorNodes = [
	EquationNode,
	HighlightNode,
	ClozeHiddenNode,
	ImageNode,
];

/**
 * The static editor theme shared with the headless converter; TableExtension warns when a scrollable-table
 * editor lacks `tableScrollableWrapper`.
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
