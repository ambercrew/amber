import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode } from "@lexical/rich-text";
import { $getRoot, EditorState } from "lexical";
import { LearningAssetHeadingDto } from "../../../../../types/elements/learningAssetHeadingDto";
import { useSplit } from "../../core/readerCoreContext";
import { useTableOfContentsContext } from "./tableOfContentsContext";

function readHeadings(
	editorState: EditorState,
	seq: number,
): LearningAssetHeadingDto[] {
	return editorState.read(() =>
		$getRoot()
			.getChildren()
			.flatMap((node, block) =>
				$isHeadingNode(node)
					? [
							{
								seq,
								block,
								level: Number(node.getTag().slice(1)),
								text: node.getTextContent(),
							},
						]
					: [],
			),
	);
}

/** Reports this split's headings as they're edited, so the table of contents follows the live text. */
export default function TableOfContentsSplitPlugin() {
	const seq = useSplit();
	const { onSplitHeadings } = useTableOfContentsContext();
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		onSplitHeadings(seq, readHeadings(editor.getEditorState(), seq));
		return editor.registerUpdateListener(
			({ editorState, dirtyElements, dirtyLeaves }) => {
				// Selection-only updates change no text.
				if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
				onSplitHeadings(seq, readHeadings(editorState, seq));
			},
		);
	}, [editor, seq, onSplitHeadings]);

	return null;
}
