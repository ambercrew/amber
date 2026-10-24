import { RefObject, useCallback, useRef } from "react";
import { LearningAssetSplitMetaDto } from "../../../../types/elements/learningAssetSplitMetaDto";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { isNoReadPoint } from "../../readPoint/readingPosition";
import { useMainScrollElement } from "../../../App/context/mainScrollContext";
import { estimateOffsetBeforeSplit } from "./heights/estimateCumulativeOffset";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "./learningAssetViewConstants";
import { landOnBlock } from "./landOnBlock";

/** Scrolls to whatever the caller is after, once `root` (the split's live editor root) is available. */
export type Land = (root: HTMLElement) => void;

export type Navigate = (seq: number, land: Land) => void;

interface Props {
	splits: LearningAssetSplitMetaDto[];
	/** Read point to restore to on open. */
	initial: ReadingPosition;
	getContentRoot: (seq: number) => HTMLElement | undefined;
	getHeight: (seq: number, charCount: number) => number;
	/** Forces a split into the mount window so `notifySplitReady` will eventually fire for it. */
	lockTo: (seq: number) => void;
	/** Resumes viewport-observer-driven mount-window tracking after a jump. */
	unlock: () => void;
}

interface ReturnValue {
	/** Flipped to `true` once the first navigation (normally restoring the read point on open) has landed. */
	restoredRef: RefObject<boolean>;
	/** Scrolls into split `seq`, mounting it first if it isn't live yet. */
	navigate: Navigate;
	/** Called when a split's editor content has mounted; runs the navigation waiting on it, if any. */
	notifySplitReady: (seq: number) => void;
}

interface PendingNavigation {
	seq: number;
	/** `null` means just wait for readiness: the learning asset opened at its very start. */
	land: Land | null;
}

/** The single way to scroll in a learning asset: mounts the split if needed, then lands a frame after its editor is ready. */
export function useSplitNavigator({
	splits,
	initial,
	getContentRoot,
	getHeight,
	lockTo,
	unlock,
}: Props): ReturnValue {
	const restoredRef = useRef(false);
	const scroller = useMainScrollElement();
	// Seeded with the saved read point; the mount window already starts locked onto its split.
	const pendingRef = useRef<PendingNavigation | null>({
		seq: initial.split,
		land: isNoReadPoint(initial) ? null : landOnBlock(initial.block),
	});

	const finish = useCallback(() => {
		restoredRef.current = true;
		unlock();
	}, [unlock]);

	const notifySplitReady = useCallback(
		(seq: number) => {
			const pending = pendingRef.current;
			if (pending?.seq !== seq) return;
			pendingRef.current = null;
			const { land } = pending;
			if (!land) {
				finish();
				return;
			}
			requestAnimationFrame(() => {
				const root = getContentRoot(seq);
				if (root) land(root);
				finish();
			});
		},
		[getContentRoot, finish],
	);

	const navigate = useCallback<Navigate>(
		(seq, land) => {
			// The split is still mounting: swap in this landing and keep waiting for it to be ready.
			if (pendingRef.current?.seq === seq) {
				pendingRef.current = { seq, land };
				return;
			}
			const root = getContentRoot(seq);
			if (root) {
				// Drop any older pending jump so it can't override this one when its split mounts.
				if (pendingRef.current) {
					pendingRef.current = null;
					finish();
				}
				land(root);
				return;
			}
			// Pre-scroll to the split's estimated offset while it mounts, so a long jump doesn't visibly snap.
			const offset = estimateOffsetBeforeSplit(splits, seq, getHeight);
			scroller?.scrollTo({
				top: Math.max(
					0,
					offset - LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
				),
				behavior: "instant",
			});
			pendingRef.current = { seq, land };
			lockTo(seq);
		},
		[getContentRoot, finish, splits, getHeight, scroller, lockTo],
	);

	return { restoredRef, navigate, notifySplitReady };
}
