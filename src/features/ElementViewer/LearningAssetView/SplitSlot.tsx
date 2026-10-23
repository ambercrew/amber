import { useCallback, useEffect, useRef, useState } from "react";
import { Divider } from "@mantine/core";
import {
	getLearningAssetSplitContent,
	updateLearningAsset,
} from "../../../api/elements/api/elementsApi";
import { FloatingMenuItem } from "../../../components/Editor/plugins/FloatingMenuPlugin";
import { HighlightCreatedPayload } from "../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import ElementEditor, { ElementEditorSearchProps } from "../ElementEditor";
import { MarkBlock } from "../marks/ReadingGutterPlugin";
import ReadingMenuItems from "../marks/ReadingMenuItems";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import { blockIndexOf } from "./blockIndexOf";
import SplitPlaceholder from "./SplitPlaceholder";

interface SplitSlotProps {
	learningAssetId: string;
	seq: number;
	/** 1-based ordinal shown in the boundary gutter marker. */
	splitNumber: number;
	isFirst: boolean;
	mounted: boolean;
	/** Best-known height (px) for the placeholder state. */
	height: number;
	buttons: FloatingMenuItem[];
	/** Ref for the slot root (observed for viewport entry + slot lookup). */
	slotRef: (element: Element | null) => void;
	/** Ref for the mounted editor's measured element. */
	observeSplit: (element: HTMLElement | null) => void;
	/** Registers the mounted editor's root element for this split. */
	registerContentRoot: (element: HTMLElement | null) => void;
	onHighlightCreated?: (
		payload: HighlightCreatedPayload,
		seq: number,
	) => void;
	onContentReady: (seq: number) => void;
	/** Block index to mark as the reader's saved read point, if it's in this split. */
	markerBlockIndex?: number;
	/** Marks anchored in this split, flagged in its gutter. */
	markBlocks?: MarkBlock[];
	/** Called with the block index containing the caret, whenever it moves in this split. */
	onCursorMove?: (seq: number, blockIndex: number) => void;
	/** Called with the block right-clicked to open the menu, and `null` once it closes. */
	onMenuAnchorChange?: (anchor: ReadingPosition | null) => void;
	/** Find-in-page search wiring for this split's editor instance. */
	search?: ElementEditorSearchProps;
}

/**
 * One split in the learning asset stack: a live editor when mounted, a cheap
 * placeholder otherwise. Renders a labeled divider at its top edge (every
 * split except the first) so the seam between Lexical instances is legible.
 */
export default function SplitSlot({
	learningAssetId,
	seq,
	splitNumber,
	isFirst,
	mounted,
	height,
	buttons,
	slotRef,
	observeSplit,
	registerContentRoot,
	onHighlightCreated,
	onContentReady,
	markerBlockIndex,
	markBlocks,
	onCursorMove,
	onMenuAnchorChange,
	search,
}: SplitSlotProps) {
	const [content, setContent] = useState<string | null>(null);
	const contentElementRef = useRef<HTMLDivElement | null>(null);
	const contentRootRef = useRef<HTMLElement | null>(null);

	const handleRootElement = useCallback(
		(element: HTMLElement | null) => {
			contentRootRef.current = element;
			registerContentRoot(element);
		},
		[registerContentRoot],
	);

	// Fetches once, the first time this slot enters the mount window. Later
	// re-mounts reuse it, so `handleChange` keeps it current with local edits.
	useEffect(() => {
		if (!mounted || content !== null) return;
		let cancelled = false;
		void getLearningAssetSplitContent({ learningAssetId, seq })
			.then(loaded => {
				if (!cancelled) setContent(loaded);
			})
			.catch(() => {
				if (!cancelled) setContent("");
			});
		return () => {
			cancelled = true;
		};
	}, [mounted, learningAssetId, seq, content]);

	useEffect(() => {
		if (mounted && content !== null) onContentReady(seq);
	}, [mounted, content, seq, onContentReady]);

	const handleHighlightCreated = useCallback(
		(payload: HighlightCreatedPayload) =>
			onHighlightCreated?.(payload, seq),
		[onHighlightCreated, seq],
	);

	const handleCursorMove = useCallback(
		(blockIndex: number) => onCursorMove?.(seq, blockIndex),
		[onCursorMove, seq],
	);

	// A right-click doesn't always move the caret, but the menu's "set here" actions mean the clicked block.
	const handleContextMenuCapture = useCallback(
		(event: React.MouseEvent) => {
			const root = contentRootRef.current;
			const block = root && blockIndexOf(root, event.target as Node);
			onMenuAnchorChange?.(
				block === null || block === undefined
					? null
					: { split: seq, block },
			);
		},
		[onMenuAnchorChange, seq],
	);
	const handleContextMenuClose = useCallback(
		() => onMenuAnchorChange?.(null),
		[onMenuAnchorChange],
	);

	const handleChange = useCallback(
		async (updated: string) => {
			// Without this, scrolling back re-mounts the editor with pre-edit content.
			setContent(updated);
			await updateLearningAsset({
				splitId: { learningAssetId, seq },
				content: updated,
			});
		},
		[learningAssetId, seq],
	);

	// Measure only the content box, not the divider above it, so its height
	// isn't double-counted when reused for the placeholder.
	const setContentElement = useCallback(
		(element: HTMLDivElement | null) => {
			contentElementRef.current = element;
			observeSplit(mounted ? element : null);
		},
		[observeSplit, mounted],
	);

	const showPlaceholder = !mounted || content === null;

	return (
		<div ref={slotRef} data-seq={seq}>
			{!isFirst && <Divider label={`Split ${splitNumber}`} my="lg" />}
			<div
				ref={setContentElement}
				onContextMenuCapture={handleContextMenuCapture}>
				{showPlaceholder ? (
					<SplitPlaceholder height={height} />
				) : (
					<ElementEditor
						initialContent={content}
						buttons={buttons}
						onChange={handleChange}
						onHighlightCreated={handleHighlightCreated}
						onRootElement={handleRootElement}
						markerBlockIndex={markerBlockIndex}
						markBlocks={markBlocks}
						onCursorMove={handleCursorMove}
						contextMenuItems={<ReadingMenuItems />}
						onContextMenuClose={handleContextMenuClose}
						search={search}
					/>
				)}
			</div>
		</div>
	);
}
