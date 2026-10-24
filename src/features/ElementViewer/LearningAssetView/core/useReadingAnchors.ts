import { useCallback, useEffect, useMemo, useRef } from "react";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { isBlockInViewport } from "./blockIndexOf";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "./learningAssetViewConstants";

interface Props {
	/** seq of the split currently at the top of the viewport. */
	primarySeq: number;
	getContentRoot: (seq: number) => HTMLElement | undefined;
	scrollElement: HTMLElement | null;
}

export interface ReadingAnchors {
	/** Records the caret's block, so actions can use it after focus moves elsewhere (e.g. the command palette). */
	trackCursor: (seq: number, block: number) => void;
	/** Records the block right-clicked to open the context menu, or `null` once it closes. */
	setMenuAnchor: (anchor: ReadingPosition | null) => void;
	/** The right-clicked block, else the caret while it's on screen, else the block at the top of the viewport. */
	resolveVisibleAnchor: () => ReadingPosition | null;
}

/** Index of the first block whose bottom edge is still below the viewport top. */
export function topVisibleBlockIndex(
	root: HTMLElement,
	topOffset: number,
): number {
	const blocks = root.children;
	for (let i = 0; i < blocks.length; i++) {
		if (blocks[i].getBoundingClientRect().bottom > topOffset + 1) return i;
	}
	return Math.max(0, blocks.length - 1);
}

/** Tracks the positions a "here" action (set read point, set mark) can target: caret, right-clicked block, viewport top. */
export function useReadingAnchors({
	primarySeq,
	getContentRoot,
	scrollElement,
}: Props): ReadingAnchors {
	// Read the latest primary seq from inside stable callbacks.
	const primarySeqRef = useRef(primarySeq);
	useEffect(() => {
		primarySeqRef.current = primarySeq;
	}, [primarySeq]);

	// Kept valid even after focus moves elsewhere, unlike the live DOM selection.
	const lastCursorRef = useRef<ReadingPosition | null>(null);
	const trackCursor = useCallback((seq: number, block: number) => {
		lastCursorRef.current = { split: seq, block };
	}, []);

	const menuAnchorRef = useRef<ReadingPosition | null>(null);
	const setMenuAnchor = useCallback((anchor: ReadingPosition | null) => {
		menuAnchorRef.current = anchor;
	}, []);

	const getTopVisibleAnchor = useCallback((): ReadingPosition | null => {
		const seq = primarySeqRef.current;
		const root = getContentRoot(seq);
		if (!root) return null;
		const block = topVisibleBlockIndex(
			root,
			LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
		);
		return { split: seq, block };
	}, [getContentRoot]);

	const resolveVisibleAnchor = useCallback(() => {
		if (menuAnchorRef.current) return menuAnchorRef.current;
		const caret = lastCursorRef.current;
		const root = caret && getContentRoot(caret.split);
		if (
			caret &&
			root &&
			scrollElement &&
			isBlockInViewport(
				root,
				caret.block,
				LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
				scrollElement.getBoundingClientRect().bottom,
			)
		) {
			return caret;
		}
		return getTopVisibleAnchor();
	}, [getContentRoot, scrollElement, getTopVisibleAnchor]);

	return useMemo(
		() => ({ trackCursor, setMenuAnchor, resolveVisibleAnchor }),
		[trackCursor, setMenuAnchor, resolveVisibleAnchor],
	);
}
