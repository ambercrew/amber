import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getNearestNodeFromDOMNode,
	$getSelection,
	$isNodeSelection,
	$isRangeSelection,
} from "lexical";

interface CursorTrackerPluginProps {
	/** Called with the top-level block index containing the caret. */
	onCursorMove: (blockIndex: number) => void;
}

/**
 * Reports the caret's block index as the selection changes, still right after a blur since Lexical
 * keeps the last selection; a `NodeSelection` (e.g. a clicked image) tracks its block too.
 */
export default function CursorTrackerPlugin({
	onCursorMove,
}: CursorTrackerPluginProps) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		return editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) {
					const blockIndex = selection.focus
						.getNode()
						.getTopLevelElementOrThrow()
						.getIndexWithinParent();
					onCursorMove(blockIndex);
					return;
				}
				if ($isNodeSelection(selection)) {
					const node = selection.getNodes()[0];
					if (!node) return;
					const blockIndex = node
						.getTopLevelElementOrThrow()
						.getIndexWithinParent();
					onCursorMove(blockIndex);
				}
			});
		});
	}, [editor, onCursorMove]);

	// Right-clicking a decorator node (e.g. an image) leaves the selection where it was, so track the
	// block under the pointer from the native contextmenu event.
	useEffect(() => {
		function handleContextMenu(event: MouseEvent) {
			editor.read(() => {
				const node = $getNearestNodeFromDOMNode(event.target as Node);
				if (!node) return;
				const blockIndex = node
					.getTopLevelElementOrThrow()
					.getIndexWithinParent();
				onCursorMove(blockIndex);
			});
		}

		return editor.registerRootListener((rootElement, prevRootElement) => {
			prevRootElement?.removeEventListener(
				"contextmenu",
				handleContextMenu,
			);
			rootElement?.addEventListener("contextmenu", handleContextMenu);
		});
	}, [editor, onCursorMove]);

	return null;
}
