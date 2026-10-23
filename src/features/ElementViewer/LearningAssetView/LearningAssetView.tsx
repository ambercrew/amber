import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Center, Container, Loader } from "@mantine/core";
import { useWindowEvent } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { getLearningAssetSplitManifest } from "../../../api/elements/api/elementsApi";
import { MetaResponseDto } from "../../../api/elements/dto/anyElementDto";
import { FloatingMenuItem } from "../../../components/Editor/plugins/FloatingMenuPlugin";
import { HighlightCreatedPayload } from "../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { searchHighlightRegistry } from "../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistry";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	selectSearchCaseSensitive,
	selectSearchCurrentIndex,
	selectSearchQuery,
} from "../../../stores/search/searchSelectors";
import { LearningAssetSplitMetaDto } from "../../../types/elements/learningAssetSplitMetaDto";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import { READ_POINT_MANUAL_GOTO_REQUESTED } from "../../../types/events/readPointManualGotoRequestedEvent";
import ContentOriginPanel from "../ContentOriginPanel";
import { useSyncSearchMatches } from "../hooks/useSyncSearchMatches";
import { useLineWidthContainerProps } from "../hooks/useLineWidthContainerProps";
import SplitSlot from "./SplitSlot";
import {
	findNearestMatchAtOrBelowViewport,
	type MatchTarget as InitialMatchTarget,
} from "./findNearestMatchAtOrBelowViewport";
import { NO_READ_POINT, useReadPoint } from "./useReadPoint";
import { useReadPointScroll } from "./useReadPointScroll";
import {
	useLearningAssetSearch,
	type MatchTarget,
} from "./useLearningAssetSearch";
import { useSearchNavigation } from "./useSearchNavigation";
import { useSplitHeights } from "./heights/useSplitHeights";
import { useSplitMountWindow } from "./useSplitMountWindow";
import { useContentWidth } from "./useContentWidth";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "./learningAssetViewConstants";
import { isBlockInViewport } from "./blockIndexOf";
import { landingScrollTop } from "./landingScrollTop";
import { useMainScrollElement } from "../../App/context/mainScrollContext";
import { MarkSlot } from "../../../types/elements/learningAssetMark";
import { flashElement } from "../marks/flashElement";
import {
	MARK_COLORS,
	READ_POINT_COLOR,
	textAnchorProgress,
} from "../marks/markLogic";
import { MarkBlock } from "../marks/ReadingGutterPlugin";
import MarkScrollbarTicks from "../marks/MarkScrollbarTicks";
import { MarksContext } from "../marks/marksContext";
import { useMarks } from "../marks/useMarks";

interface LearningAssetViewProps {
	learningAssetId: string;
	readPoint: ReadingPosition;
	meta: MetaResponseDto;
	buttons: FloatingMenuItem[];
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
}

/**
 * Renders a learning asset as a virtualized vertical stack of splits: a small window
 * of live Lexical editors around the viewport, cheap placeholders elsewhere.
 * Only a lightweight split index is fetched on open, never every split's
 * content. Relies on native scroll anchoring to keep visible content stable
 * as splits resize, with a manual fallback on engines that lack it.
 */
export default function LearningAssetView({
	learningAssetId,
	readPoint,
	meta,
	buttons,
	onHighlightCreated,
}: LearningAssetViewProps) {
	const [contentWidth, containerRef] = useContentWidth();
	const containerProps = useLineWidthContainerProps();

	const [splits, setSplits] = useState<LearningAssetSplitMetaDto[] | null>(
		null,
	);
	useEffect(() => {
		let cancelled = false;
		void getLearningAssetSplitManifest(learningAssetId)
			.then(manifest => {
				if (!cancelled) setSplits(manifest);
			})
			.catch(() => {
				if (!cancelled) setSplits([]);
			});
		return () => {
			cancelled = true;
		};
	}, [learningAssetId]);

	const { mountedSeqs, primarySeq, registerSlot, lockTo, unlock } =
		useSplitMountWindow({
			splits: splits ?? [],
			initialSeq: readPoint.split,
		});

	// The editable root of each mounted split, keyed by seq, so position math
	// reads block geometry through Lexical rather than querying the DOM.
	const contentRootsRef = useRef<Map<number, HTMLElement>>(new Map());
	const getContentRoot = useCallback(
		(seq: number) => contentRootsRef.current.get(seq),
		[],
	);

	// `restoredRef` is shared with the hook below: low until the saved read
	// point has been restored on open, so it can hold off scroll-tracking
	// until then.
	const { restoredRef, notifySplitReady, goToReadPoint } = useReadPointScroll(
		{
			initial: readPoint,
			getContentRoot,
			jumpTo: lockTo,
			releaseJump: unlock,
		},
	);
	const { getHeight, observeSplit } = useSplitHeights(
		learningAssetId,
		contentWidth,
	);

	const searchQuery = useAppSelector(selectSearchQuery);
	const searchCaseSensitive = useAppSelector(selectSearchCaseSensitive);
	const searchCurrentIndex = useAppSelector(selectSearchCurrentIndex);
	const {
		onSplitMatches,
		totalMatches,
		countsBySeq,
		resolveMatchTarget,
		toGlobalIndex,
	} = useLearningAssetSearch({
		learningAssetId,
		splits: splits ?? [],
		query: searchQuery,
		caseSensitive: searchCaseSensitive,
		mountedSeqs,
	});
	const { goToMatch, notifySearchTargetReady } = useSearchNavigation({
		splits: splits ?? [],
		getContentRoot,
		getHeight,
		jumpTo: lockTo,
		releaseJump: unlock,
	});
	const handleSearchNavigate = useCallback(
		(target: MatchTarget) => goToMatch(target.seq, target.localIndex),
		[goToMatch],
	);
	const resolveLocalMatchAtOrBelow = useCallback((seq: number) => {
		const ranges = searchHighlightRegistry.getRanges(String(seq));
		if (!ranges) return null;
		const index = ranges.findIndex(
			range =>
				range.getBoundingClientRect().top >=
				LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
		);
		return index === -1 ? null : index;
	}, []);
	const resolveInitialSearchIndex = useCallback(() => {
		const target: InitialMatchTarget | null =
			findNearestMatchAtOrBelowViewport(
				splits ?? [],
				countsBySeq,
				primarySeq,
				resolveLocalMatchAtOrBelow,
			);
		return target ? toGlobalIndex(target) : 0;
	}, [
		splits,
		countsBySeq,
		primarySeq,
		resolveLocalMatchAtOrBelow,
		toGlobalIndex,
	]);
	useSyncSearchMatches({
		totalMatches,
		resolveMatchTarget,
		onNavigate: handleSearchNavigate,
		resolveInitialIndex: resolveInitialSearchIndex,
	});
	const currentSearchTarget =
		searchCurrentIndex >= 0 ? resolveMatchTarget(searchCurrentIndex) : null;

	const [displayedReadPoint, setDisplayedReadPoint] = useState(readPoint);

	const {
		recordExtractReadPoint,
		trackCursor,
		getLastCursor,
		setMenuAnchor,
		getMenuAnchor,
		getTopVisibleAnchor,
	} = useReadPoint({
		learningAssetId,
		primarySeq,
		initial: readPoint,
		getContentRoot,
		lastSplitSeq: splits?.[splits.length - 1]?.seq,
		restoredRef,
		onReadPointChange: setDisplayedReadPoint,
	});

	const hasDisplayedReadPoint =
		displayedReadPoint.split !== NO_READ_POINT.split ||
		displayedReadPoint.block !== NO_READ_POINT.block;
	// Goes where the marker is, so the shortcut, marker and scrollbar tick agree.
	const handleGoToReadPointRequested = useCallback(() => {
		if (!hasDisplayedReadPoint) {
			notifications.show({ message: "No read point set" });
			return;
		}
		goToReadPoint(displayedReadPoint, block =>
			flashElement(block, READ_POINT_COLOR),
		);
	}, [hasDisplayedReadPoint, displayedReadPoint, goToReadPoint]);
	useWindowEvent(
		READ_POINT_MANUAL_GOTO_REQUESTED,
		handleGoToReadPointRequested,
	);

	const scrollElement = useMainScrollElement();
	// The right-clicked block wins; the caret only counts while it's on screen, else what's in view does.
	const resolveMarkAnchor = useCallback(() => {
		const menuAnchor = getMenuAnchor();
		if (menuAnchor) return menuAnchor;
		const caret = getLastCursor();
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
	}, [
		getMenuAnchor,
		getLastCursor,
		getContentRoot,
		scrollElement,
		getTopVisibleAnchor,
	]);
	const goToMark = useCallback(
		(anchor: ReadingPosition, slot: MarkSlot) =>
			goToReadPoint(anchor, block =>
				flashElement(block, MARK_COLORS[slot]),
			),
		[goToReadPoint],
	);
	const marks = useMarks({
		learningAssetId,
		resolveSetAnchor: resolveMarkAnchor,
		goTo: goToMark,
	});
	const progressOf = useCallback(
		(anchor: ReadingPosition) =>
			textAnchorProgress(anchor, splits ?? [], getHeight),
		[splits, getHeight],
	);
	const landingScrollTopOf = useCallback(
		(anchor: ReadingPosition) =>
			scrollElement &&
			landingScrollTop(
				scrollElement,
				anchor,
				contentRootsRef.current.get(anchor.split),
				splits?.find(split => split.seq === anchor.split)?.blockCount ??
					0,
			),
		[scrollElement, splits],
	);
	const marksContext = useMemo(
		() => ({ marks, progressOf }),
		[marks, progressOf],
	);
	const markBlocksBySeq = useMemo(() => {
		const bySeq = new Map<number, MarkBlock[]>();
		for (const { slot, anchor } of marks) {
			bySeq.set(anchor.split, [
				...(bySeq.get(anchor.split) ?? []),
				{ slot, block: anchor.block },
			]);
		}
		return bySeq;
	}, [marks]);

	const handleHighlightCreated = useCallback(
		(payload: HighlightCreatedPayload, seq: number) => {
			onHighlightCreated?.(payload);
			recordExtractReadPoint(seq, payload.endBlockIndex);
		},
		[onHighlightCreated, recordExtractReadPoint],
	);

	const handleContentReady = useCallback(
		(seq: number) => {
			notifySplitReady(seq);
			notifySearchTargetReady(seq);
		},
		[notifySplitReady, notifySearchTargetReady],
	);

	// Cached per seq so the ref callback's identity is stable across renders
	// — otherwise React would detach/reattach every slot's ref (and its
	// IntersectionObserver registration) on every render.
	const slotRefsRef = useRef<Map<number, (element: Element | null) => void>>(
		new Map(),
	);
	const setSlotRef = useCallback(
		(seq: number) => {
			const cached = slotRefsRef.current.get(seq);
			if (cached) return cached;
			const fn = registerSlot(seq);
			slotRefsRef.current.set(seq, fn);
			return fn;
		},
		[registerSlot],
	);

	// Cached per seq for the same ref-identity reason as `setSlotRef`.
	const contentRootRefsRef = useRef<
		Map<number, (element: HTMLElement | null) => void>
	>(new Map());
	const registerContentRoot = useCallback((seq: number) => {
		const cached = contentRootRefsRef.current.get(seq);
		if (cached) return cached;
		const fn = (element: HTMLElement | null) => {
			if (element) contentRootsRef.current.set(seq, element);
			else contentRootsRef.current.delete(seq);
		};
		contentRootRefsRef.current.set(seq, fn);
		return fn;
	}, []);

	if (!splits) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		);
	}

	return (
		<MarksContext value={marksContext}>
			<Container ref={containerRef} {...containerProps} py="lg">
				{contentWidth > 0 &&
					// eslint-disable-next-line react-hooks/refs
					splits.map((split, index) => (
						<SplitSlot
							key={split.seq}
							learningAssetId={learningAssetId}
							seq={split.seq}
							splitNumber={index + 1}
							isFirst={index === 0}
							mounted={mountedSeqs.has(split.seq)}
							height={getHeight(split.seq, split.charCount)}
							buttons={buttons}
							slotRef={setSlotRef(split.seq)}
							observeSplit={observeSplit(
								split.seq,
								split.charCount,
							)}
							registerContentRoot={registerContentRoot(split.seq)}
							onHighlightCreated={handleHighlightCreated}
							onContentReady={handleContentReady}
							onCursorMove={trackCursor}
							onMenuAnchorChange={setMenuAnchor}
							markBlocks={markBlocksBySeq.get(split.seq)}
							markerBlockIndex={
								hasDisplayedReadPoint &&
								split.seq === displayedReadPoint.split
									? displayedReadPoint.block
									: undefined
							}
							search={{
								editorKey: String(split.seq),
								query: searchQuery,
								caseSensitive: searchCaseSensitive,
								currentMatchLocalIndex:
									currentSearchTarget?.seq === split.seq
										? currentSearchTarget.localIndex
										: null,
								onMatches: onSplitMatches,
							}}
						/>
					))}
				<ContentOriginPanel meta={meta} />
			</Container>
			<MarkScrollbarTicks
				container={scrollElement?.parentElement ?? null}
				scrollElement={scrollElement}
				trackTop="var(--app-shell-header-height, 0px)"
				trackBottom="var(--app-shell-footer-offset, 0px)"
				readPoint={hasDisplayedReadPoint ? displayedReadPoint : null}
				landingScrollTopOf={landingScrollTopOf}
			/>
		</MarksContext>
	);
}
