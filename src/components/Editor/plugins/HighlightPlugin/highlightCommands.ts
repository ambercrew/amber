import { createCommand } from "lexical";
import { type MantineColor } from "@mantine/core";
import { type SerializedLexicalNodeTree } from "../../lexicalJsonConversion";

export const CREATE_HIGHLIGHT_COMMAND = createCommand<MantineColor>(
	"CREATE_HIGHLIGHT_COMMAND",
);

/** Dispatched after a highlight is created, so plugins inside the editor can react to it. */
export const HIGHLIGHT_CREATED_COMMAND = createCommand<HighlightCreatedPayload>(
	"HIGHLIGHT_CREATED_COMMAND",
);

export interface HighlightCreatedPayload {
	id: string;
	/** Serialized nodes of just the selected range, before wrapping. */
	selectionNodes: SerializedLexicalNodeTree[];
	/** Serialized nodes of the entire document, after wrapping the selection in the highlight. */
	fullNodes: SerializedLexicalNodeTree[];
	/** Plain text of just the selected range. */
	selectionText: string;
	/** Plain text of the entire document, after wrapping the selection in the highlight. */
	fullText: string;
	color: MantineColor;
	/** Index, among the editor root's top-level children, of the block containing the end of the selection. */
	endBlockIndex: number;
}
