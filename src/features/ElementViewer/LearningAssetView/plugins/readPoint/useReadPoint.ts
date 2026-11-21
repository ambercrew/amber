import { RefObject, useCallback, useEffect } from "react";
import { useReadingCommand } from "../../../../../commands/readingCommands";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";
import { NO_READ_POINT } from "../../../readPoint/readingPosition";
import { OnViewportChange } from "../../core/useViewportChange";
import { useMainScrollElement } from "../../../../../components/AppLayout/appLayoutContext";
import { ReadPointSource } from "../../../../../types/elements/readPointSource";
import { useReadPointPlacement } from "../../../readPoint/useReadPointPlacement";
import { ReadingAnchors } from "../../core/useReadingAnchors";

interface Props {
	learningAssetId: string;
	/** Read point to restore to on open. */
	initial: ReadingPosition;
	/** Read point precedence to open with (the study session's Return keeps the last visit's). */
	resumeSource?: ReadPointSource;
	/** Called on unmount with the precedence the read point was left at. */
	onLeave?: (source: ReadPointSource) => void;
	/** The editable root of the mounted split `seq`, whose children are its blocks. */
	getContentRoot: (seq: number) => HTMLElement | undefined;
	/** Seq of the last split, to detect scrolling to the very end; `undefined` for an empty learning asset. */
	lastSplitSeq: number | undefined;
	/** `true` once the restore on open has landed; scrolls before that aren't the reader's, so aren't saved. */
	restoredRef: RefObject<boolean>;
	/** Where a manual set lands (shared with marks), and what's at the viewport top. */
	anchors: Pick<ReadingAnchors, "resolveVisibleAnchor" | "topVisibleBlock">;
	/** When to re-measure the read point at the viewport top. */
	onViewportChange: OnViewportChange;
	/** Called when a manual set/clear lands, to move the on-screen marker; scrolling and extracts never call it. */
	onReadPointChange?: (readPoint: ReadingPosition) => void;
}

interface ReturnValue {
	/** Records the split and block right after a new extract or cloze as the read point. */
	recordExtractReadPoint: (seq: number, block: number) => void;
}

/** Whether the last block of the learning asset's last split is fully scrolled into view. */
function isAtDocumentEnd(
	root: HTMLElement,
	scrollElement: HTMLElement,
): boolean {
	const lastBlock = root.children[root.children.length - 1];
	return (
		!!lastBlock &&
		lastBlock.getBoundingClientRect().bottom <=
			scrollElement.getBoundingClientRect().bottom
	);
}

/** Tracks a text learning asset's read point from scrolling, extracts and the set/clear commands; `useReadPointPlacement` decides precedence. */
export function useReadPoint({
	learningAssetId,
	initial,
	resumeSource,
	onLeave,
	getContentRoot,
	lastSplitSeq,
	restoredRef,
	anchors,
	onViewportChange,
	onReadPointChange,
}: Props): ReturnValue {
	const { place, accepts } = useReadPointPlacement({
		learningAssetId,
		initial,
		resumeSource,
		onLeave,
	});
	// Only a manual placement moves the on-screen marker.
	const placeManually = useCallback(
		(readPoint: ReadingPosition) => {
			if (place(readPoint, "manual")) onReadPointChange?.(readPoint);
		},
		[place, onReadPointChange],
	);

	const scrollElement = useMainScrollElement();
	const recordScrollReadPoint = useCallback(() => {
		const source: ReadPointSource = "automatic";
		// The restore scroll on open isn't the reader's.
		if (!restoredRef.current || !accepts(source) || !scrollElement) return;
		const top = anchors.topVisibleBlock();
		if (!top) return;
		// At the very end there's nothing left to resume from, so it clears.
		const root = getContentRoot(top.split);
		if (
			top.split === lastSplitSeq &&
			root &&
			isAtDocumentEnd(root, scrollElement)
		) {
			place(NO_READ_POINT, source);
			return;
		}
		place(top, source);
	}, [
		restoredRef,
		accepts,
		scrollElement,
		anchors,
		getContentRoot,
		lastSplitSeq,
		place,
	]);

	useEffect(
		() => onViewportChange(recordScrollReadPoint),
		[onViewportChange, recordScrollReadPoint],
	);

	const recordExtractReadPoint = useCallback(
		(seq: number, block: number) => {
			place({ split: seq, block }, "extract");
		},
		[place],
	);

	const handleSet = useCallback(() => {
		const readPoint = anchors.resolveVisibleAnchor();
		if (readPoint) placeManually(readPoint);
	}, [anchors, placeManually]);
	const handleClear = useCallback(
		() => placeManually(NO_READ_POINT),
		[placeManually],
	);
	useReadingCommand("set-read-point", handleSet);
	useReadingCommand("clear-read-point", handleClear);

	return { recordExtractReadPoint };
}
