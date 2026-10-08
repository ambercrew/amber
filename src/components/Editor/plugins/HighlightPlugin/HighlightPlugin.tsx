import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getRoot,
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_EDITOR,
} from "lexical";
import { $wrapSelectionInMarkNode } from "@lexical/mark";
import { $generateJSONFromSelectedNodes } from "@lexical/clipboard";
import { type SerializedLexicalNodeTree } from "../../lexicalJsonConversion";
import { $createHighlightNode, HighlightNode } from "./HighlightNode";
import {
	CREATE_HIGHLIGHT_COMMAND,
	HighlightCreatedPayload,
} from "./highlightCommands";
import { $trimSelectionWhitespace } from "./trimSelectionWhitespace";

interface Props {
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
}

export function HighlightPlugin({ onHighlightCreated }: Props) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		if (!editor.hasNodes([HighlightNode])) {
			throw new Error(
				"HighlightPlugin: HighlightNode not registered in editor",
			);
		}
		return editor.registerCommand(
			CREATE_HIGHLIGHT_COMMAND,
			color => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection) || selection.isCollapsed()) {
					return false;
				}
				if (!selection.getTextContent().trim()) return false;
				$trimSelectionWhitespace(selection);
				const selectionText = selection.getTextContent();

				const { nodes: selectionNodes } =
					$generateJSONFromSelectedNodes<SerializedLexicalNodeTree>(
						editor,
						selection,
					);
				// Whichever point comes later in document order is the end of
				// the extracted range, regardless of which way the user dragged.
				const endPoint = selection.isBackward()
					? selection.anchor
					: selection.focus;
				const endBlockIndex = endPoint
					.getNode()
					.getTopLevelElementOrThrow()
					.getIndexWithinParent();

				const id = crypto.randomUUID();
				$wrapSelectionInMarkNode(
					selection,
					selection.isBackward(),
					id,
					ids => $createHighlightNode(ids, color),
				);
				// A `null` selection tells $generateJSONFromSelectedNodes to
				// include every node, i.e. the whole document — read live from
				// the active (not-yet-committed) update, unlike
				// `editor.getEditorState()`.
				const { nodes: fullNodes } =
					$generateJSONFromSelectedNodes<SerializedLexicalNodeTree>(
						editor,
						null,
					);
				const fullText = $getRoot().getTextContent();
				onHighlightCreated?.({
					id,
					selectionNodes,
					fullNodes,
					selectionText,
					fullText,
					color,
					endBlockIndex,
				});
				return true;
			},
			COMMAND_PRIORITY_EDITOR,
		);
	}, [editor, onHighlightCreated]);

	return null;
}
