import {
	PropsWithChildren,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { HighlightCreatedPayload } from "../../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { LearningAssetSplitMetaDto } from "../../../../types/elements/learningAssetSplitMetaDto";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { useMainScrollElement } from "../../../App/context/mainScrollContext";
import { useSplitHeights } from "./heights/useSplitHeights";
import { useContentWidth } from "./useContentWidth";
import { useSplitMountWindow } from "./useSplitMountWindow";
import { ReaderCore, ReaderCoreContext } from "./readerCoreContext";
import { SplitStackContext, SplitStackWiring } from "./splitStackContext";
import { useKeyedRefCallbacks } from "./useKeyedRefCallbacks";
import { useReadingAnchors } from "./useReadingAnchors";
import { useSplitNavigator } from "./useSplitNavigator";
import { useViewportChange } from "./useViewportChange";
import { landOnViewPosition } from "./viewPosition";
import { ViewPosition } from "../../../../types/elements/viewPosition";

function setOrDelete<K, V>(map: Map<K, V>, key: K, value: V | null) {
	if (value) map.set(key, value);
	else map.delete(key);
}

interface ReaderCoreProviderProps extends PropsWithChildren {
	learningAssetId: string;
	splits: LearningAssetSplitMetaDto[];
	/** Read point restored on open. */
	initialReadPoint: ReadingPosition;
	/** Scroll position to open at in place of the read point, e.g. returning to a study session's element. */
	initialViewPosition?: ViewPosition;
	/** Called on unmount with where the reader last was (`null` if they never got past the opening jump); scrolling is only measured while it's set. */
	onLeave?: (position: ViewPosition | null) => void;
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
}

/**
 * Owns the virtualized split stack — mount window, heights, content roots,
 * navigation and reading anchors — and shares it with plugins via `useReaderCore`.
 */
export default function ReaderCoreProvider({
	learningAssetId,
	splits,
	initialReadPoint,
	initialViewPosition,
	onLeave,
	children,
	onHighlightCreated,
}: ReaderCoreProviderProps) {
	// Only this opening's first landing uses it.
	const [initialLand] = useState(
		() => initialViewPosition && landOnViewPosition(initialViewPosition),
	);
	const initialSeq = initialViewPosition?.split ?? initialReadPoint.split;
	const [contentWidth, containerRef] = useContentWidth();
	const scrollElement = useMainScrollElement();
	const {
		mountedSeqs,
		primarySeq,
		registerSlot,
		lockTo,
		unlock,
		notifySplitReady: notifyWindowSplitReady,
	} = useSplitMountWindow({ splits, initialSeq });
	const { getHeight, observeSplit } = useSplitHeights(
		learningAssetId,
		contentWidth,
	);

	// Keyed by seq, so position math reads block geometry through Lexical rather than querying the DOM.
	const contentRootsRef = useRef<Map<number, HTMLElement>>(new Map());
	const getContentRoot = useCallback(
		(seq: number) => contentRootsRef.current.get(seq),
		[],
	);
	const contentRootRef = useKeyedRefCallbacks(
		useCallback(
			(seq: number) => (element: HTMLElement | null) =>
				setOrDelete(contentRootsRef.current, seq, element),
			[],
		),
	);
	const splitBoxesRef = useRef<Map<number, HTMLElement>>(new Map());
	const getSplitBox = useCallback(
		(seq: number) => splitBoxesRef.current.get(seq),
		[],
	);
	const splitBoxRef = useKeyedRefCallbacks(
		useCallback(
			(seq: number) => (element: HTMLElement | null) =>
				setOrDelete(splitBoxesRef.current, seq, element),
			[],
		),
	);
	const slotRef = useKeyedRefCallbacks(registerSlot);

	const { restoredRef, navigate, notifySplitReady } = useSplitNavigator({
		splits,
		initial: initialViewPosition ?? initialReadPoint,
		initialLand,
		getContentRoot,
		getHeight,
		lockTo,
		unlock,
	});
	const { onViewportChange, notifyViewportChange } =
		useViewportChange(scrollElement);
	const notifyContentReady = useCallback(
		(seq: number) => {
			// Before the navigator, whose landing unlocks the window: opening isn't the reader scrolling.
			const atTop = notifyWindowSplitReady(seq);
			notifySplitReady(seq);
			// The top split mounting after a fast scroll settles is first measurable now.
			if (atTop) notifyViewportChange();
		},
		[notifySplitReady, notifyWindowSplitReady, notifyViewportChange],
	);
	const anchors = useReadingAnchors({
		primarySeq,
		getContentRoot,
		scrollElement,
	});
	// Measured as the reader scrolls, as the DOM may already be gone by unmount.
	const lastPositionRef = useRef(initialViewPosition ?? null);
	const tracking = onLeave !== undefined;
	useEffect(() => {
		if (!tracking) return;
		return onViewportChange(() => {
			if (!restoredRef.current) return;
			lastPositionRef.current =
				anchors.topVisible() ?? lastPositionRef.current;
		});
	}, [tracking, onViewportChange, restoredRef, anchors]);
	const onLeaveRef = useRef(onLeave);
	useEffect(() => {
		onLeaveRef.current = onLeave;
	}, [onLeave]);
	useEffect(() => () => onLeaveRef.current?.(lastPositionRef.current), []);

	const core = useMemo<ReaderCore>(
		() => ({
			learningAssetId,
			splits,
			initialReadPoint,
			scrollElement,
			primarySeq,
			mountedSeqs,
			getHeight,
			getContentRoot,
			getSplitBox,
			navigate,
			restoredRef,
			anchors,
			onViewportChange,
		}),
		[
			learningAssetId,
			splits,
			initialReadPoint,
			scrollElement,
			primarySeq,
			mountedSeqs,
			getHeight,
			getContentRoot,
			getSplitBox,
			navigate,
			restoredRef,
			anchors,
			onViewportChange,
		],
	);
	const wiring = useMemo<SplitStackWiring>(
		() => ({
			contentWidth,
			containerRef,
			slotRef,
			observeSplit,
			contentRootRef,
			splitBoxRef,
			notifyContentReady,
			onHighlightCreated,
		}),
		[
			contentWidth,
			containerRef,
			slotRef,
			observeSplit,
			contentRootRef,
			splitBoxRef,
			notifyContentReady,
			onHighlightCreated,
		],
	);

	return (
		<ReaderCoreContext value={core}>
			<SplitStackContext value={wiring}>{children}</SplitStackContext>
		</ReaderCoreContext>
	);
}
