import { useCallback } from "react";
import { $createTextNode } from "lexical";
import { $unwrapMarkNode } from "@lexical/mark";
import { $dfs } from "@lexical/utils";
import { serializedNodesToLexicalJson } from "../../../components/Editor/lexicalJsonConversion";
import { HighlightCreatedPayload } from "../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import {
	$createClozeHiddenNode,
	$isClozeHiddenNode,
} from "../../../components/Editor/plugins/ClozePlugin/ClozeHiddenNode";
import { $isHighlightNode } from "../../../components/Editor/plugins/HighlightPlugin/HighlightNode";
import { $isImageNode } from "../../../components/Editor/plugins/ImagePlugin/ImageNode";
import useAppDispatch from "../../../hooks/useAppDispatch";
import {
	createCardAction,
	createExtractAction,
} from "../../../stores/elements/elementsActions";
import { ElementId } from "../../../types/elements/elementId";
import { CLOZE_COLOR } from "../utils/highlightColors";

export function useHighlightCreatedHandler(elementId: ElementId | undefined) {
	const dispatch = useAppDispatch();

	return useCallback(
		({ id, selectionNodes, fullNodes, color }: HighlightCreatedPayload) => {
			if (color === CLOZE_COLOR) {
				void dispatch(
					createCardAction({
						id,
						meta: {
							name: null,
							parent: elementId!,
							origin: { type: "inherited" },
						},
						front: serializedNodesToLexicalJson(fullNodes, () => {
							$stripOtherHighlights(id);
							$buildClozeFront(id);
						}),
						back: serializedNodesToLexicalJson(selectionNodes, () =>
							$stripOtherHighlights(id),
						),
					}),
				);
				return;
			}

			void dispatch(
				createExtractAction({
					id,
					meta: {
						name: null,
						parent: elementId!,
						origin: { type: "inherited" },
					},
					content: serializedNodesToLexicalJson(selectionNodes, () =>
						$stripOtherHighlights(id),
					),
				}),
			);
		},
		[dispatch, elementId],
	);
}

// A cloze's front is the whole document with the phrase swapped for a hidden placeholder, so it's
// read in context; the back is just the phrase (see $stripOtherHighlights).
function $buildClozeFront(highlightId: string): void {
	for (const { node } of $dfs()) {
		if ($isHighlightNode(node) && node.getHighlightId() === highlightId) {
			node.replace($createClozeHiddenNode(node.getTextContent()));
		}
	}
}

// Unwraps every other highlight and cloze (and detaches images from their occlusion) in the copy going
// into the new element, leaving the source alone; `$dfs()` snapshots the tree, so editing it is safe.
function $stripOtherHighlights(currentHighlightId: string): void {
	for (const { node } of $dfs()) {
		if (
			$isHighlightNode(node) &&
			node.getHighlightId() !== currentHighlightId
		) {
			$unwrapMarkNode(node);
		} else if ($isClozeHiddenNode(node)) {
			node.replace($createTextNode(node.getHiddenText()));
		} else if ($isImageNode(node)) {
			node.detachOcclusion();
		}
	}
}
