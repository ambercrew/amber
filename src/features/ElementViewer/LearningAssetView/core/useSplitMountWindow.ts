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
	/** seqs that should currently render a live editor: only the window's centre while it lands, then its neighbours too. */
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
	/** Called once a mounted split's editor has content; mounts the centre's neighbours after it paints. Returns whether it's the split at the viewport top, outside a landing jump. */
	notifySplitReady: (seq: number) => boolean;
}

interface MountWindow {
	centerSeq: number;
	// Neighbours wait for the centre to paint, so opening, jumping or settling paints one split instead of three (slow with many equations).
	neighborsMounted: boolean;
}

function mountedAround(
	splits: LearningAssetSplitMetaDto[],
	{ centerSeq, neighborsMounted }: MountWindow,
): Set<number> {
	const reach = neighborsMounted ? LEARNING_ASSET_SPLIT_MOUNT_NEIGHBORS : 0;
	const mounted = new Set<number>();
	const centerIndex = splits.findIndex(split => split.seq === centerSeq);
	const center = centerIndex === -1 ? 0 : centerIndex;
	for (let i = center - reach; i <= center + reach; i++) {
		if (i >= 0 && i < splits.length) mounted.add(splits[i].seq);
	}
	return mounted;
}

const withNeighbors = (current: MountWindow): MountWindow =>
	current.neighborsMounted ? current : { ...current, neighborsMounted: true };

/** Mounts a centre split plus fixed neighbours as live editors; the centre follows the viewport top, but only once a fast scroll settles. */
export function useSplitMountWindow({
	splits,
	initialSeq,
}: Props): ReturnValue {
	const scroller = useMainScrollElement();
	const [primarySeq, setPrimarySeq] = useState(initialSeq);
	// Read from timers and callbacks, which `primarySeq` would reach a render late.
	const latestPrimaryRef = useRef(initialSeq);
	const [mountWindow, setMountWindow] = useState<MountWindow>({
		centerSeq: initialSeq,
		neighborsMounted: false,
	});
	const mountedSeqs = useMemo(
		() => mountedAround(splits, mountWindow),
		[splits, mountWindow],
	);
	// For reads only; writes go through `setMountWindow` updaters so they see uncommitted changes.
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

	const recenter = useCallback(
		(seq: number) =>
			setMountWindow(current =>
				seq === current.centerSeq
					? current
					: {
							centerSeq: seq,
							// Within the mounted window the target is already live, so its neighbours can follow at once.
							neighborsMounted: mountedAround(
								splits,
								current,
							).has(seq),
						},
			),
		[splits],
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
			if (!lockedRef.current) recenter(latestPrimaryRef.current);
		}, SCROLL_SETTLE_IN_MILLISECONDS);
	}, [cancelSettle, recenter]);

	const registerSlot = useTopVisibleSlot(scroller, seq => {
		if (lockedRef.current) return;
		latestPrimaryRef.current = seq;
		setPrimarySeq(seq);
		// A pending settle recenters on the latest primary itself.
		if (settleTimeoutRef.current !== null) return;
		if (mountedSeqsRef.current.has(seq) && !isScrollingFast())
			recenter(seq);
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
			setMountWindow({ centerSeq: seq, neighborsMounted: false });
		},
		[cancelSettle, sampler],
	);

	const unlock = useCallback(() => {
		lockedRef.current = false;
		setMountWindow(withNeighbors);
	}, []);

	const notifySplitReady = useCallback((seq: number) => {
		// While locked, `unlock` mounts them once the jump has landed.
		if (lockedRef.current) return false;
		requestAnimationFrame(() => {
			if (lockedRef.current) return;
			// Only the centre that's still waiting; a recenter since then waits for its own centre.
			setMountWindow(current =>
				current.centerSeq === seq ? withNeighbors(current) : current,
			);
		});
		return seq === latestPrimaryRef.current;
	}, []);

	return {
		mountedSeqs,
		primarySeq,
		registerSlot,
		lockTo,
		unlock,
		notifySplitReady,
	};
}
