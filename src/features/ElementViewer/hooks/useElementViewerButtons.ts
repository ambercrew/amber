import { useCallback, useMemo, useState } from "react";
import { useStore } from "react-redux";
import { useNavigate } from "react-router";
import {
	$getSelection,
	$isRangeSelection,
	LexicalEditor,
	LexicalNode,
	RangeSelection,
} from "lexical";
import { $unwrapMarkNode } from "@lexical/mark";
import { $dfs } from "@lexical/utils";
import { FloatingMenuItem } from "../../../components/Editor/plugins/FloatingMenuPlugin";
import { CREATE_HIGHLIGHT_COMMAND } from "../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import {
	$isHighlightNode,
	HighlightNode,
} from "../../../components/Editor/plugins/HighlightPlugin/HighlightNode";
import { paths } from "../../../paths";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import { addAiContextSnippet } from "../../../stores/aiContext/aiReducer";
import { existsInTree } from "../../../stores/elements/elementsActions";
import { RootState } from "../../../stores/store";
import { trashElementAction } from "../../../stores/trash/trashActions";
import { ElementId } from "../../../types/elements/elementId";
import {
	ADD_AI_CONTEXT_BUTTON,
	CLOZE_BUTTON,
	EXTRACT_BUTTON,
	OPEN_HIGHLIGHT_BUTTON,
	REMOVE_HIGHLIGHT_BUTTON,
} from "../highlightFloatingMenuButtons";

export const CLOZE_COLOR = "blue";

function $getHighlightNodeFromSelection(selection: RangeSelection) {
	for (const node of selection.getNodes()) {
		let current: LexicalNode | null = node;
		while (current !== null) {
			if ($isHighlightNode(current)) return current;
			current = current.getParent();
		}
	}
	return null;
}

function $getHighlightNodesFromSelection(selection: RangeSelection) {
	const highlightNodes = new Map<string, HighlightNode>();
	for (const node of selection.getNodes()) {
		let current: LexicalNode | null = node;
		while (current !== null) {
			if ($isHighlightNode(current)) {
				highlightNodes.set(current.getKey(), current);
				break;
			}
			current = current.getParent();
		}
	}
	return Array.from(highlightNodes.values());
}

function highlightElementId(highlightNode: HighlightNode): ElementId {
	return {
		type: highlightNode.getColor() === CLOZE_COLOR ? "card" : "extract",
		id: highlightNode.getHighlightId(),
	};
}

function $getHighlightElementIdsFromSelection(
	selection: RangeSelection,
): Map<string, ElementId> {
	const elementIds = new Map<string, ElementId>();
	for (const highlightNode of $getHighlightNodesFromSelection(selection)) {
		elementIds.set(
			highlightNode.getHighlightId(),
			highlightElementId(highlightNode),
		);
	}
	return elementIds;
}

// One highlight can span several mark nodes (e.g. across paragraphs), so every
// node sharing a removed id is unwrapped, not just those under the selection.
function removeHighlights(editor: LexicalEditor, highlightIds: string[]) {
	editor.update(
		() => {
			for (const { node } of $dfs()) {
				if (
					$isHighlightNode(node) &&
					highlightIds.includes(node.getHighlightId())
				) {
					$unwrapMarkNode(node);
				}
			}
		},
		{ discrete: true },
	);
}

/** A highlight removal awaiting confirmation, since it also trashes the
 * highlights' extracts/cards. */
export interface PendingHighlightRemoval {
	editor: LexicalEditor;
	highlightIds: string[];
	/** Only the elements that still exist (not deleted or already trashed). */
	elementIds: ElementId[];
}

export function useElementViewerButtons() {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const store = useStore<RootState>();
	const aiEnabled = useAppSelector(selectSettings)?.enableAi ?? false;
	const [pendingHighlightRemoval, setPendingHighlightRemoval] =
		useState<PendingHighlightRemoval | null>(null);

	const confirmHighlightRemoval = useCallback(() => {
		if (!pendingHighlightRemoval) return;
		const { editor, highlightIds, elementIds } = pendingHighlightRemoval;
		removeHighlights(editor, highlightIds);
		for (const elementId of elementIds) {
			void dispatch(trashElementAction(elementId));
		}
	}, [pendingHighlightRemoval, dispatch]);

	const cancelHighlightRemoval = useCallback(
		() => setPendingHighlightRemoval(null),
		[],
	);

	const buttons = useMemo<FloatingMenuItem[]>(
		() => [
			// Create a yellow (extract) or blue (cloze) highlight.
			{
				...EXTRACT_BUTTON,
				isActive: () => false,
				onClick: editor => {
					editor.dispatchCommand(CREATE_HIGHLIGHT_COMMAND, "yellow");
				},
			},
			{
				...CLOZE_BUTTON,
				isActive: () => false,
				onClick: editor => {
					editor.dispatchCommand(
						CREATE_HIGHLIGHT_COMMAND,
						CLOZE_COLOR,
					);
				},
			},
			...(aiEnabled
				? [
						{
							name: "add-ai-context-divider",
							divider: true as const,
						},
						{
							...ADD_AI_CONTEXT_BUTTON,
							isActive: () => false,
							onClick: (
								editor: LexicalEditor,
								_isActive: boolean,
								closeMenu: () => void,
							) => {
								editor.getEditorState().read(() => {
									const selection = $getSelection();
									if (!$isRangeSelection(selection)) return;
									const text = selection.getTextContent();
									if (!text.trim()) return;
									dispatch(addAiContextSnippet(text));
									closeMenu();
								});
							},
						},
					]
				: []),
			{ name: "create-highlight-divider", divider: true },
			// Acts on the highlight (if any) under the current selection.
			{
				...OPEN_HIGHLIGHT_BUTTON,
				actsOnCaret: true,
				isActive: () => false,
				isVisible: selection =>
					!!$getHighlightNodeFromSelection(selection),
				onClick: editor => {
					editor.getEditorState().read(() => {
						const selection = $getSelection();
						if (!$isRangeSelection(selection)) return;
						const highlightNode =
							$getHighlightNodeFromSelection(selection);
						if (highlightNode) {
							const { type, id } =
								highlightElementId(highlightNode);
							void navigate(paths.element(type, id));
						}
					});
				},
			},
			{
				...REMOVE_HIGHLIGHT_BUTTON,
				actsOnCaret: true,
				isActive: () => false,
				isVisible: selection =>
					!!$getHighlightNodeFromSelection(selection),
				onClick: editor => {
					const highlights = editor.getEditorState().read(() => {
						const selection = $getSelection();
						return $isRangeSelection(selection)
							? $getHighlightElementIdsFromSelection(selection)
							: new Map<string, ElementId>();
					});
					if (highlights.size === 0) return;
					const highlightIds = Array.from(highlights.keys());
					const { tree } = store.getState().elements;
					const elementIds = Array.from(highlights.values()).filter(
						elementId => existsInTree(tree, elementId),
					);
					// Nothing would be trashed, so there's nothing to confirm.
					if (elementIds.length === 0) {
						removeHighlights(editor, highlightIds);
						return;
					}
					setPendingHighlightRemoval({
						editor,
						highlightIds,
						elementIds,
					});
				},
			},
		],
		[navigate, dispatch, store, aiEnabled],
	);

	return {
		buttons,
		pendingHighlightRemoval,
		confirmHighlightRemoval,
		cancelHighlightRemoval,
	};
}
