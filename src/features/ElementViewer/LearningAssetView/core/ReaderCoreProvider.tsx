import { PropsWithChildren, useCallback, useMemo, useRef } from "react";
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

function setOrDelete<K, V>(map: Map<K, V>, key: K, value: V | null) {
	if (value) map.set(key, value);
	else map.delete(key);
}

interface ReaderCoreProviderProps extends PropsWithChildren {
	learningAssetId: string;
	splits: LearningAssetSplitMetaDto[];
	/** Read point restored on open. */
	initialReadPoint: ReadingPosition;
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
	onHighlightCreated,
	children,
}: ReaderCoreProviderProps) {
	const [contentWidth, containerRef] = useContentWidth();
	const scrollElement = useMainScrollElement();
	const { mountedSeqs, primarySeq, registerSlot, lockTo, unlock } =
		useSplitMountWindow({ splits, initialSeq: initialReadPoint.split });
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
		initial: initialReadPoint,
		getContentRoot,
		getHeight,
		lockTo,
		unlock,
	});
	const anchors = useReadingAnchors({
		primarySeq,
		getContentRoot,
		scrollElement,
	});

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
			notifyContentReady: notifySplitReady,
			onHighlightCreated,
		}),
		[
			contentWidth,
			containerRef,
			slotRef,
			observeSplit,
			contentRootRef,
			splitBoxRef,
			notifySplitReady,
			onHighlightCreated,
		],
	);

	return (
		<ReaderCoreContext value={core}>
			<SplitStackContext value={wiring}>{children}</SplitStackContext>
		</ReaderCoreContext>
	);
}
