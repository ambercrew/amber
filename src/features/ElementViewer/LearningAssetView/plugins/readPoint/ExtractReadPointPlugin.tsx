import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_LOW } from "lexical";
import { HIGHLIGHT_CREATED_COMMAND } from "../../../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { useSplit } from "../../core/readerCoreContext";
import { useRecordExtractReadPoint } from "../../../readPoint/readPointContext";

/** Moves the read point to the end of each extract or cloze made in this split. */
export default function ExtractReadPointPlugin() {
	const [editor] = useLexicalComposerContext();
	const seq = useSplit();
	const recordExtractReadPoint = useRecordExtractReadPoint();
	useEffect(
		() =>
			editor.registerCommand(
				HIGHLIGHT_CREATED_COMMAND,
				payload => {
					recordExtractReadPoint(seq, payload.endBlockIndex);
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
		[editor, seq, recordExtractReadPoint],
	);
	return null;
}
