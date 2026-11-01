import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { LEARNING_ASSET_SPLIT_MOUNT_NEIGHBORS } from "./learningAssetViewConstants";
import { useTopVisibleSlot } from "./useTopVisibleSlot";
import { LearningAssetSplitMetaDto } from "../../../../types/elements/learningAssetSplitMetaDto";
import { useMainScrollElement } from "../../../App/context/mainScrollContext";
import {
	createScrollSampler,
	SCROLL_SETTLE_IN_MILLISECONDS,
} from "../../scrollPace";

interface Props {
	splits: LearningAssetSplitMetaDto[];
	/** Split to mount initially, locked there until `unlock` is called. */
	initialSeq: number;
}

interface ReturnValue {
	/** seqs that should currently render a live editor: the window's centre and its neighbours. */
	mountedSeqs: Set<number>;
	/** seq of the split currently at the top of the viewport. */
	primarySeq: number;
	/** Ref callback for each slot's root element, observed for viewport entry. */
	registerSlot: (seq: number) => (element: Element | null) => void;
	/**
	 * Forces the mount window onto `seq` and locks it there, bypassing the
	 * viewport observer until `unlock` is called — otherwise the still-stale
	 * scroll position would immediately override it.
	 */
	lockTo: (seq: number) => void;
	/** Resumes viewport-observer-driven tracking after a `lockTo`. */
	unlock: () => void;
	/** Called once a mounted split's editor has content. Returns whether it's the split at the viewport top, outside a landing jump. */
	notifySplitReady: (seq: number) => boolean;
}

function windowAround(
	splits: LearningAssetSplitMetaDto[],
	centerSeq: number,
): Set<number> {
	const reach = LEARNING_ASSET_SPLIT_MOUNT_NEIGHBORS;
	const mounted = new Set<number>();
	const centerIndex = splits.findIndex(split => split.seq === centerSeq);
	const center = centerIndex === -1 ? 0 : centerIndex;
	for (let i = center - reach; i <= center + reach; i++) {
		if (i >= 0 && i < splits.length) mounted.add(splits[i].seq);
	}
	return mounted;
}

/** Mounts a centre split plus fixed neighbours as live editors; the centre follows the viewport top, but only once a fast scroll settles. */
export function useSplitMountWindow({
	splits,
	initialSeq,
}: Props): ReturnValue {
	const scroller = useMainScrollElement();
	const [primarySeq, setPrimarySeq] = useState(initialSeq);
	// Read from timers and callbacks, which `primarySeq` would reach a render late.
	const latestPrimaryRef = useRef(initialSeq);
	const [centerSeq, setCenterSeq] = useState(initialSeq);
	const mountedSeqs = useMemo(
		() => windowAround(splits, centerSeq),
		[splits, centerSeq],
	);
	const mountedSeqsRef = useRef(mountedSeqs);
	useLayoutEffect(() => {
		mountedSeqsRef.current = mountedSeqs;
	}, [mountedSeqs]);
	// Starts locked so the window stays on `initialSeq`: at open the viewport sits at scrollTop 0,
	// so the observer would otherwise collapse the window onto the first splits.
	const lockedRef = useRef(true);
	const [sampler] = useState(createScrollSampler);
	const settleTimeoutRef = useRef<number | null>(null);

	const isScrollingFast = useCallback(
		() => !!scroller && sampler.isFast(scroller.clientHeight),
		[scroller, sampler],
	);

	const cancelSettle = useCallback(() => {
		if (settleTimeoutRef.current === null) return;
		clearTimeout(settleTimeoutRef.current);
		settleTimeoutRef.current = null;
	}, []);

	const scheduleSettle = useCallback(() => {
		cancelSettle();
		settleTimeoutRef.current = window.setTimeout(() => {
			settleTimeoutRef.current = null;
			if (!lockedRef.current) setCenterSeq(latestPrimaryRef.current);
		}, SCROLL_SETTLE_IN_MILLISECONDS);
	}, [cancelSettle]);

	const registerSlot = useTopVisibleSlot(scroller, seq => {
		if (lockedRef.current) return;
		latestPrimaryRef.current = seq;
		setPrimarySeq(seq);
		// A pending settle recenters on the latest primary itself.
		if (settleTimeoutRef.current !== null) return;
		if (mountedSeqsRef.current.has(seq) && !isScrollingFast())
			setCenterSeq(seq);
		else scheduleSettle();
	});

	useEffect(() => {
		if (!scroller) return;
		const handleScroll = () => {
			// A jump's own pre-scroll isn't the reader flying past.
			if (lockedRef.current) return;
			sampler.push(scroller.scrollTop);
			// Keeps deferring only while still flying, so slowing down to read lets the settle fire.
			if (settleTimeoutRef.current !== null && isScrollingFast())
				scheduleSettle();
		};
		scroller.addEventListener("scroll", handleScroll, { passive: true });
		return () => scroller.removeEventListener("scroll", handleScroll);
	}, [scroller, sampler, isScrollingFast, scheduleSettle]);

	useEffect(() => cancelSettle, [cancelSettle]);

	const lockTo = useCallback(
		(seq: number) => {
			lockedRef.current = true;
			cancelSettle();
			sampler.clear();
			latestPrimaryRef.current = seq;
			setPrimarySeq(seq);
			setCenterSeq(seq);
		},
		[cancelSettle, sampler],
	);

	const unlock = useCallback(() => {
		lockedRef.current = false;
	}, []);

	const notifySplitReady = useCallback(
		(seq: number) => !lockedRef.current && seq === latestPrimaryRef.current,
		[],
	);

	return {
		mountedSeqs,
		primarySeq,
		registerSlot,
		lockTo,
		unlock,
		notifySplitReady,
	};
}
