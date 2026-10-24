import { RefObject, useCallback, useEffect, useRef } from "react";
import { useReadingCommand } from "../../../../../commands/readingCommands";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";
import { NO_READ_POINT } from "../../../readPoint/readingPosition";
import { useMainScrollElement } from "../../../../App/context/mainScrollContext";
import { ReadPointSource } from "../../../readPoint/readPointPrecedence";
import { useReadPointPlacement } from "../../../readPoint/useReadPointPlacement";
import { viewportTop } from "../../core/viewportTop";
import {
	ReadingAnchors,
	topVisibleBlockIndex,
} from "../../core/useReadingAnchors";

interface Props {
	learningAssetId: string;
	/** seq of the split currently at the top of the viewport. */
	primarySeq: number;
	/** Read point to restore to on open. */
	initial: ReadingPosition;
	/** The editable root of the mounted split `seq`, whose children are its blocks. */
	getContentRoot: (seq: number) => HTMLElement | undefined;
	/** Seq of the last split, to detect scrolling to the very end; `undefined` for an empty learning asset. */
	lastSplitSeq: number | undefined;
	/** `true` once the restore on open has landed; scrolls before that aren't the reader's, so aren't saved. */
	restoredRef: RefObject<boolean>;
	/** Where a manual set lands, shared with marks. */
	anchors: Pick<ReadingAnchors, "resolveVisibleAnchor">;
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
	primarySeq,
	initial,
	getContentRoot,
	lastSplitSeq,
	restoredRef,
	anchors,
	onReadPointChange,
}: Props): ReturnValue {
	const { place, accepts } = useReadPointPlacement({
		learningAssetId,
		initial,
	});
	// Read the latest primary seq from inside the (stable) scroll handler.
	const primarySeqRef = useRef(primarySeq);
	useEffect(() => {
		primarySeqRef.current = primarySeq;
	}, [primarySeq]);

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
		const seq = primarySeqRef.current;
		const root = getContentRoot(seq);
		if (!root) return;
		// At the very end there's nothing left to resume from, so it clears.
		if (seq === lastSplitSeq && isAtDocumentEnd(root, scrollElement)) {
			place(NO_READ_POINT, source);
			return;
		}
		const block = topVisibleBlockIndex(root, viewportTop(scrollElement));
		place({ split: seq, block }, source);
	}, [
		restoredRef,
		accepts,
		scrollElement,
		getContentRoot,
		lastSplitSeq,
		place,
	]);

	// One measurement per frame: scroll fires far more often than paints.
	useEffect(() => {
		if (!scrollElement) return;
		let frame: number | null = null;
		const handler = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				recordScrollReadPoint();
			});
		};
		scrollElement.addEventListener("scroll", handler, { passive: true });
		return () => {
			scrollElement.removeEventListener("scroll", handler);
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [scrollElement, recordScrollReadPoint]);

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
