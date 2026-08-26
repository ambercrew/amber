import { RefObject, useCallback, useEffect, useRef } from "react";
import { useWindowEvent } from "@mantine/hooks";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "./learningAssetViewConstants";
import useAutoSave from "../hooks/useAutoSave";
import useApi from "../../../hooks/useApi";
import { updateReadPoint } from "../../../api/elements/api/elementsApi";
import { ReadPoint } from "../../../types/elements/readPoint";
import { READ_POINT_MANUAL_SET_REQUESTED } from "../../../types/events/readPointManualSetRequestedEvent";
import { READ_POINT_MANUAL_CLEAR_REQUESTED } from "../../../types/events/readPointManualClearRequestedEvent";
import { useMainScrollElement } from "../../App/context/mainScrollContext";

interface Props {
	learningAssetId: string;
	/** seq of the split currently at the top of the viewport. */
	primarySeq: number;
	/** Read point to restore to on open. */
	initial: ReadPoint;
	/** The editable root of the mounted split `seq`, whose children are its blocks. */
	getContentRoot: (seq: number) => HTMLElement | undefined;
	/**
	 * Seq of the learning asset's last split, used to detect when the user has
	 * scrolled to the absolute end. Omitted while the split manifest hasn't
	 * loaded yet.
	 */
	lastSplitSeq?: number;
	/**
	 * Flipped to `true` once restore has anchored the viewport — gating saves
	 * off it prevents the restore scroll from being recorded as a user scroll
	 * back to the top.
	 */
	restoredRef: RefObject<boolean>;
	/**
	 * Called whenever a manual set/clear lands a new read point, so callers
	 * can reflect it live (e.g. moving the read point marker) without
	 * waiting for the next open. Not called for automatic scroll-tracking or
	 * extract/cloze creation — only a manual placement should move the
	 * on-screen marker.
	 */
	onReadPointChange?: (readPoint: ReadPoint) => void;
}

interface ReturnValue {
	/**
	 * Called when an extract or cloze is created in this learning asset, with the
	 * split and block right after the extracted range.
	 */
	recordExtractReadPoint: (seq: number, block: number) => void;
	/**
	 * Called whenever the caret moves within a split, so a manual set can use
	 * the last known caret position even after focus has moved elsewhere
	 * (e.g. to the command palette's search field).
	 */
	trackCursor: (seq: number, block: number) => void;
	/** The read point as last recorded, regardless of which mechanism set it. */
	getCurrentReadPoint: () => ReadPoint;
}

/** The sentinel value meaning "no read point" — also a learning asset's state before it has ever had one saved. */
export const NO_READ_POINT: ReadPoint = { split: 0, block: 0 };

/** Index of the first block whose bottom edge is still below the viewport top. */
function topVisibleBlockIndex(root: HTMLElement, topOffset: number): number {
	const blocks = root.children;
	for (let i = 0; i < blocks.length; i++) {
		if (blocks[i].getBoundingClientRect().bottom > topOffset + 1) return i;
	}
	return Math.max(0, blocks.length - 1);
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

/**
 * Persists the read point as the user scrolls, extracts/clozes are created,
 * or a manual set/clear is requested. Flushes on unmount, app close, and
 * before a sync, not just after the debounce settles.
 *
 * Three placement sources compete for the same read point, in priority
 * order: manual beats extract/cloze creation, which beats automatic
 * scroll-tracking. Once a manual or extract placement happens, automatic
 * tracking stops until the next open.
 */
export function useReadPoint({
	learningAssetId,
	primarySeq,
	initial,
	getContentRoot,
	lastSplitSeq,
	restoredRef,
	onReadPointChange,
}: Props): ReturnValue {
	const lastSavedRef = useRef<ReadPoint>({
		split: initial.split,
		block: initial.block,
	});
	// Read the latest primary seq from inside the (stable) scroll handler.
	const primarySeqRef = useRef(primarySeq);
	useEffect(() => {
		primarySeqRef.current = primarySeq;
	}, [primarySeq]);

	// Last known caret position, kept valid even after focus moves elsewhere
	// (e.g. the command palette), unlike learning asset live DOM selection.
	const lastCursorRef = useRef<ReadPoint | null>(null);
	const trackCursor = useCallback((seq: number, block: number) => {
		lastCursorRef.current = { split: seq, block };
	}, []);

	// Tracks which mechanism currently owns the read point for this opening.
	// Higher-priority placements block lower-priority ones from overwriting
	// them again, but never the other way around.
	const precedenceRef = useRef<"automatic" | "extract" | "manual">(
		"automatic",
	);

	const { callApi } = useApi();
	const handleSave = useCallback(
		async (content: string) => {
			const readPoint = JSON.parse(content) as ReadPoint;
			const last = lastSavedRef.current;
			if (
				last.split === readPoint.split &&
				last.block === readPoint.block
			) {
				return;
			}
			lastSavedRef.current = readPoint;
			await updateReadPoint({ learningAssetId, readPoint });
		},
		[learningAssetId],
	);
	const { onContentUpdate } = useAutoSave({ onSave: handleSave, callApi });

	// Captured eagerly rather than read at flush time: split editors tear
	// down before flush runs, so a deferred DOM read would find no root.
	const persistReadPoint = useCallback(
		(readPoint: ReadPoint) => {
			onContentUpdate(() => JSON.stringify(readPoint));
		},
		[onContentUpdate],
	);

	// Used only by the manual set/clear paths so callers can move the
	// on-screen marker immediately. Automatic scroll-tracking and
	// extract/cloze creation persist the read point but leave the marker
	// where the reader last placed it manually.
	const placeReadPoint = useCallback(
		(readPoint: ReadPoint) => {
			persistReadPoint(readPoint);
			onReadPointChange?.(readPoint);
		},
		[persistReadPoint, onReadPointChange],
	);

	const scrollElement = useMainScrollElement();
	const recordReadPoint = useCallback(() => {
		// Don't record scrolling that happens before the restore has landed,
		// or once a manual/extract placement has taken over for this opening.
		if (!restoredRef.current || precedenceRef.current !== "automatic") {
			return;
		}
		if (!scrollElement) return;
		const seq = primarySeqRef.current;
		const root = getContentRoot(seq);
		if (!root) return;
		// Reaching the end of the learning asset means there is nothing left to
		// resume from, so the read point clears instead of pointing at the
		// last block.
		if (seq === lastSplitSeq && isAtDocumentEnd(root, scrollElement)) {
			persistReadPoint(NO_READ_POINT);
			return;
		}
		const block = topVisibleBlockIndex(
			root,
			LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
		);
		persistReadPoint({ split: seq, block });
	}, [
		restoredRef,
		scrollElement,
		getContentRoot,
		persistReadPoint,
		lastSplitSeq,
	]);

	// Throttle to one measurement per frame — scroll fires far more often than
	// paints, and measuring a block's rect on every event is wasteful.
	useEffect(() => {
		if (!scrollElement) return;
		let frame: number | null = null;
		const handler = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				recordReadPoint();
			});
		};
		scrollElement.addEventListener("scroll", handler, { passive: true });
		return () => {
			scrollElement.removeEventListener("scroll", handler);
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [scrollElement, recordReadPoint]);

	const recordExtractReadPoint = useCallback(
		(seq: number, block: number) => {
			// A manual placement is a deliberate bookmark; an extract created
			// afterward shouldn't relocate it.
			if (precedenceRef.current === "manual") return;
			precedenceRef.current = "extract";
			persistReadPoint({ split: seq, block });
		},
		[persistReadPoint],
	);

	const recordManualReadPoint = useCallback(() => {
		precedenceRef.current = "manual";
		if (lastCursorRef.current) {
			placeReadPoint(lastCursorRef.current);
			return;
		}
		// No caret has been seen in any split yet — fall back to the block at
		// the top of the viewport.
		const seq = primarySeqRef.current;
		const root = getContentRoot(seq);
		if (!root) return;
		const block = topVisibleBlockIndex(
			root,
			LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
		);
		placeReadPoint({ split: seq, block });
	}, [getContentRoot, placeReadPoint]);

	const recordManualClearReadPoint = useCallback(() => {
		precedenceRef.current = "manual";
		placeReadPoint(NO_READ_POINT);
	}, [placeReadPoint]);

	useWindowEvent(READ_POINT_MANUAL_SET_REQUESTED, recordManualReadPoint);
	useWindowEvent(
		READ_POINT_MANUAL_CLEAR_REQUESTED,
		recordManualClearReadPoint,
	);

	const getCurrentReadPoint = useCallback(() => lastSavedRef.current, []);

	return {
		recordExtractReadPoint,
		trackCursor,
		getCurrentReadPoint,
	};
}
