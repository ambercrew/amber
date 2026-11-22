import { useCallback, useEffect, useMemo, useRef } from "react";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { isBlockInViewport } from "./blockIndexOf";
import { viewportTop } from "./viewportTop";
import { contentTopOf } from "./scrollGeometry";
import { ViewPosition } from "../../../../types/elements/viewPosition";

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
	/** The block at the viewport top; `null` while the top split is unmounted. */
	topVisibleBlock: () => ReadingPosition | null;
	/** `topVisibleBlock` plus the scroll's offset past it, which costs another layout read. */
	topVisible: () => ViewPosition | null;
}

/**
 * Index of the first block whose bottom edge is still below the viewport top.
 * Blocks stack in order, so a binary search keeps this cheap on every scroll frame of a long split.
 */
export function topVisibleBlockIndex(
	root: HTMLElement,
	topOffset: number,
): number {
	const blocks = root.children;
	let low = 0;
	let high = blocks.length - 1;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (blocks[middle].getBoundingClientRect().bottom > topOffset + 1)
			high = middle;
		else low = middle + 1;
	}
	return Math.max(0, low);
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

	const topVisibleBlock = useCallback((): ReadingPosition | null => {
		const seq = primarySeqRef.current;
		const root = getContentRoot(seq);
		if (!root) return null;
		return {
			split: seq,
			block: topVisibleBlockIndex(root, viewportTop(scrollElement)),
		};
	}, [getContentRoot, scrollElement]);

	const topVisible = useCallback((): ViewPosition | null => {
		const top = topVisibleBlock();
		if (!top) return null;
		const { split: seq, block } = top;
		const target = getContentRoot(seq)?.children[block];
		const offset =
			target && scrollElement
				? scrollElement.scrollTop - contentTopOf(target, scrollElement)
				: 0;
		return { split: seq, block, offset };
	}, [getContentRoot, scrollElement, topVisibleBlock]);

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
				viewportTop(scrollElement),
				scrollElement.getBoundingClientRect().bottom,
			)
		) {
			return caret;
		}
		return topVisibleBlock();
	}, [getContentRoot, scrollElement, topVisibleBlock]);

	return useMemo(
		() => ({
			trackCursor,
			setMenuAnchor,
			resolveVisibleAnchor,
			topVisibleBlock,
			topVisible,
		}),
		[
			trackCursor,
			setMenuAnchor,
			resolveVisibleAnchor,
			topVisibleBlock,
			topVisible,
		],
	);
}
