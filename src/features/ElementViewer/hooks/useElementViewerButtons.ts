import { useMemo } from "react";
import { useNavigate } from "react-router";
import {
	$getSelection,
	$isRangeSelection,
	LexicalEditor,
	LexicalNode,
	RangeSelection,
} from "lexical";
import { $unwrapMarkNode } from "@lexical/mark";
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

function $isClozeHighlight(selection: RangeSelection): boolean {
	return (
		$getHighlightNodeFromSelection(selection)?.getColor() === CLOZE_COLOR
	);
}

export function useElementViewerButtons(): FloatingMenuItem[] {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const aiEnabled = useAppSelector(selectSettings)?.enableAi ?? false;

	return useMemo<FloatingMenuItem[]>(
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
							void navigate(
								paths.element(
									$isClozeHighlight(selection)
										? "card"
										: "extract",
									highlightNode.getHighlightId(),
								),
							);
						}
					});
				},
			},
			{
				...REMOVE_HIGHLIGHT_BUTTON,
				isActive: () => false,
				isVisible: selection =>
					!!$getHighlightNodeFromSelection(selection),
				onClick: editor => {
					editor.update(() => {
						const selection = $getSelection();
						if (!$isRangeSelection(selection)) return;
						for (const highlightNode of $getHighlightNodesFromSelection(
							selection,
						)) {
							$unwrapMarkNode(highlightNode);
						}
					});
				},
			},
		],
		[navigate, dispatch, aiEnabled],
	);
}
