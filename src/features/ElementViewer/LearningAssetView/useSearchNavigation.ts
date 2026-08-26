import { useCallback, useRef } from "react";
import { scrollToRange } from "../../../components/Editor/plugins/SearchHighlightPlugin/scrollToRange";
import { searchHighlightRegistry } from "../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistry";
import { LearningAssetSplitMetaDto } from "../../../types/elements/learningAssetSplitMetaDto";
import { estimateOffsetBeforeSplit } from "./heights/estimateCumulativeOffset";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "./learningAssetViewConstants";
import { useMainScrollElement } from "../../App/context/mainScrollContext";

interface Props {
	splits: LearningAssetSplitMetaDto[];
	/** The editable root of the mounted split `seq`, whose children are its blocks. */
	getContentRoot: (seq: number) => HTMLElement | undefined;
	getHeight: (seq: number, charCount: number) => number;
	/** Forces a split into the mount window so `notifySearchTargetReady` will eventually fire for it. */
	jumpTo: (seq: number) => void;
	/** Resumes viewport-observer-driven mount-window tracking after a jump. */
	releaseJump: () => void;
}

interface ReturnValue {
	/** Scrolls to a match, mounting its split first if it isn't already live. */
	goToMatch: (seq: number, localIndex: number) => void;
	/** Called when a split's editor content has mounted; resolves any pending match scroll waiting on it. */
	notifySearchTargetReady: (seq: number) => void;
}

interface PendingMatchScroll {
	seq: number;
	localIndex: number;
}

/**
 * Navigates to a find-in-page match within a learning asset, mounting its split
 * first if needed (pre-scrolling to an estimated offset so the jump doesn't
 * visibly snap).
 */
export function useSearchNavigation({
	splits,
	getContentRoot,
	getHeight,
	jumpTo,
	releaseJump,
}: Props): ReturnValue {
	const pendingRef = useRef<PendingMatchScroll | null>(null);
	const scroller = useMainScrollElement();

	const scrollToMatchNow = useCallback(
		(seq: number, localIndex: number): boolean => {
			const ranges = searchHighlightRegistry.getRanges(String(seq));
			const range = ranges?.[localIndex];
			if (range) {
				scrollToRange(range);
				return true;
			}
			// Ranges not resolved yet — fall back to the split's root.
			const root = getContentRoot(seq);
			root?.scrollIntoView({ block: "start" });
			return root !== undefined;
		},
		[getContentRoot],
	);

	const goToMatch = useCallback(
		(seq: number, localIndex: number) => {
			if (getContentRoot(seq)) {
				scrollToMatchNow(seq, localIndex);
				return;
			}
			const offset = estimateOffsetBeforeSplit(splits, seq, getHeight);
			scroller?.scrollTo({
				top: Math.max(
					0,
					offset - LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
				),
				behavior: "instant",
			});
			pendingRef.current = { seq, localIndex };
			jumpTo(seq);
		},
		[splits, getHeight, getContentRoot, jumpTo, scrollToMatchNow, scroller],
	);

	const notifySearchTargetReady = useCallback(
		(seq: number) => {
			const pending = pendingRef.current;
			if (pending?.seq !== seq) return;
			pendingRef.current = null;
			requestAnimationFrame(() => {
				scrollToMatchNow(pending.seq, pending.localIndex);
				releaseJump();
			});
		},
		[releaseJump, scrollToMatchNow],
	);

	return { goToMatch, notifySearchTargetReady };
}
