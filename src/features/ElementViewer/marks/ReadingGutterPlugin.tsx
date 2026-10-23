import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useBlockTop } from "../../../components/Editor/plugins/useBlockTop";
import { MarkSlot } from "../../../types/elements/learningAssetMark";
import GutterMarkers from "./GutterMarkers";
import { useGutterWidth } from "./useGutterWidth";

export interface MarkBlock {
	slot: MarkSlot;
	/** Index of the anchored block among the editor root's children. */
	block: number;
}

interface BlockMarkersProps {
	block: number;
	gutterWidth: number | null;
	readPoint: boolean;
	slots: MarkSlot[];
}

function BlockMarkers({ block, ...markers }: BlockMarkersProps) {
	const top = useBlockTop(block);
	if (top === null) return null;
	return <GutterMarkers top={top} {...markers} />;
}

interface ReadingGutterPluginProps {
	/** Index of the block the read point is on, if it's in this split. */
	readPointBlock?: number;
	marks: MarkBlock[];
}

/** The read point and numbered mark markers in the gutter beside the blocks they're on in this split. Clicking a mark goes to it. */
export default function ReadingGutterPlugin({
	readPointBlock,
	marks,
}: ReadingGutterPluginProps) {
	const [editor] = useLexicalComposerContext();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	useEffect(
		() =>
			editor.registerRootListener(root =>
				setAnchor(root?.parentElement ?? null),
			),
		[editor],
	);
	const gutterWidth = useGutterWidth(anchor);

	const slotsByBlock = new Map<number, MarkSlot[]>();
	if (readPointBlock !== undefined) slotsByBlock.set(readPointBlock, []);
	for (const { slot, block } of marks) {
		slotsByBlock.set(block, [...(slotsByBlock.get(block) ?? []), slot]);
	}

	return [...slotsByBlock].map(([block, slots]) => (
		<BlockMarkers
			key={block}
			block={block}
			gutterWidth={gutterWidth}
			readPoint={block === readPointBlock}
			slots={slots}
		/>
	));
}
