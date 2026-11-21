import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $dfs } from "@lexical/utils";
import { $isHighlightNode } from "./HighlightNode";

interface RevealHighlightPluginProps {
	/** Id of the element whose highlight to scroll to; nothing happens while `undefined`. */
	highlightOf: string | undefined;
	/** Changes for each request, so asking again for the same highlight scrolls again. */
	revealKey: string;
}

/** Scrolls the editor's highlight of an element into view, e.g. the passage a card was made from. */
export default function RevealHighlightPlugin({
	highlightOf,
	revealKey,
}: RevealHighlightPluginProps) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		if (!highlightOf) return;
		// Waits a frame, so the editor's content is in the DOM.
		const frame = requestAnimationFrame(() => {
			const key = editor.getEditorState().read(() =>
				$dfs()
					.find(
						({ node }) =>
							$isHighlightNode(node) &&
							node.getIDs().includes(highlightOf),
					)
					?.node.getKey(),
			);
			if (key)
				editor
					.getElementByKey(key)
					?.scrollIntoView({ block: "center" });
		});
		return () => cancelAnimationFrame(frame);
	}, [editor, highlightOf, revealKey]);

	return null;
}
