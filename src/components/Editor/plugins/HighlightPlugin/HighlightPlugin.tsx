import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_EDITOR,
	COMMAND_PRIORITY_LOW,
} from "lexical";
import { $wrapSelectionInMarkNode } from "@lexical/mark";
import { $generateJSONFromSelectedNodes } from "@lexical/clipboard";
import { type SerializedLexicalNodeTree } from "../../lexicalJsonConversion";
import { $createHighlightNode, HighlightNode } from "./HighlightNode";
import {
	CREATE_HIGHLIGHT_COMMAND,
	HIGHLIGHT_CREATED_COMMAND,
	HighlightCreatedPayload,
} from "./highlightCommands";
import { $trimSelectionWhitespace } from "./trimSelectionWhitespace";

export function HighlightPlugin() {
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
				const payload: HighlightCreatedPayload = {
					id,
					selectionNodes,
					fullNodes,
					color,
					endBlockIndex,
				};
				editor.dispatchCommand(HIGHLIGHT_CREATED_COMMAND, payload);
				return true;
			},
			COMMAND_PRIORITY_EDITOR,
		);
	}, [editor]);

	return null;
}

interface HighlightCreatedListenerProps {
	onHighlightCreated: (payload: HighlightCreatedPayload) => void;
}

/** Calls `onHighlightCreated` for each `HIGHLIGHT_CREATED_COMMAND`, letting other listeners run too. */
export function HighlightCreatedListener({
	onHighlightCreated,
}: HighlightCreatedListenerProps) {
	const [editor] = useLexicalComposerContext();
	useEffect(
		() =>
			editor.registerCommand(
				HIGHLIGHT_CREATED_COMMAND,
				payload => {
					onHighlightCreated(payload);
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
		[editor, onHighlightCreated],
	);
	return null;
}
