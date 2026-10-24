import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { useDocumentState } from "@embedpdf/core/react";
import { useActiveDocument } from "@embedpdf/plugin-document-manager/react";
import { AnnotationLayer } from "@embedpdf/plugin-annotation/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { Scroller, useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { SelectionLayer } from "@embedpdf/plugin-selection/react";
import { SearchLayer } from "@embedpdf/plugin-search/react";
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react";
import { HEADROOM_FIXED_AT } from "../../../App/components/App";
import { hideHeadroom } from "../../../../hooks/useElementHeadroom";
import { useSetHeadroomOverride } from "../../../App/context/headroomOverrideContext";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { isNoReadPoint } from "../../readPoint/readingPosition";
import { MarkSlot } from "../../../../types/elements/learningAssetMark";
import {
	MARK_COLORS,
	pdfAnchorProgress,
	READ_POINT_COLOR,
} from "../../marks/markLogic";
import MarkScrollbarTicks from "../../marks/MarkScrollbarTicks";
import { MarksContext } from "../../marks/marksContext";
import { useMarks } from "../../marks/useMarks";
import PdfContextMenu, { PDF_PAGE_ATTRIBUTE } from "./PdfContextMenu";
import PdfPageMarks, { PdfPageFlash } from "./PdfPageMarks";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { setZoomOwnedByCurrentView } from "../../../../stores/elements/elementsReducer";
import FindInPageBar from "../../FindInPageBar";
import { usePdfAnnotationsPersistence } from "../hooks/usePdfAnnotationsPersistence";
import { usePdfFindInPage } from "../hooks/usePdfFindInPage";
import { usePdfLinkNavigationRenderer } from "../hooks/usePdfLinkNavigation";
import { usePdfReadPoint } from "../hooks/usePdfReadPoint";
import { usePdfSelectionAnchor } from "../hooks/usePdfSelectionAnchor";
import { usePdfToolbarHeadroom } from "../hooks/usePdfToolbarHeadroom";
import { usePdfZoomPersistence } from "../hooks/usePdfZoomPersistence";
import PdfFloatingMenu from "./PdfFloatingMenu";
import PdfToolbar from "./PdfToolbar/PdfToolbar";
import styles from "./PdfViewport.module.css";

/** Renders nothing. `usePdfToolbarHeadroom` needs `<Viewport>`'s React
 * context, but `PdfToolbar` renders as a sibling outside `<Viewport>` (its
 * children render inside the actual scroll container, and the toolbar must
 * float over it instead of scrolling away) — so this bridges the pinned
 * state from inside that context back out to the parent. */
function ScrollWatcher({
	onPinnedChange,
	hideRequests,
}: {
	onPinnedChange: (pinned: boolean) => void;
	/** Bumped by each jump to hide the header; one made before this mounts (behind `<Viewport>`'s gate) still applies. */
	hideRequests: number;
}) {
	const { pinned, viewportElement } = usePdfToolbarHeadroom({
		fixedAt: HEADROOM_FIXED_AT,
	});
	const handledHideRequestsRef = useRef(0);
	useEffect(() => {
		if (!viewportElement || hideRequests === handledHideRequestsRef.current)
			return;
		handledHideRequestsRef.current = hideRequests;
		hideHeadroom(viewportElement);
	}, [hideRequests, viewportElement]);
	const setHeadroomOverride = useSetHeadroomOverride();

	useEffect(() => {
		onPinnedChange(pinned);
		setHeadroomOverride?.(pinned);
	}, [pinned, onPinnedChange, setHeadroomOverride]);

	// Hand control back to the main scroll area once the PDF unmounts.
	useEffect(() => {
		return () => setHeadroomOverride?.(null);
	}, [setHeadroomOverride]);

	return null;
}

interface PdfDocumentContentProps {
	learningAssetId: string;
	readPoint: ReadingPosition;
}

export default function PdfDocumentContent({
	learningAssetId,
	readPoint,
}: PdfDocumentContentProps) {
	const { activeDocumentId } = useActiveDocument();
	const documentState = useDocumentState(activeDocumentId);

	if (documentState?.status === "error") {
		return (
			<Center h="100%">
				<Stack align="center" gap="xs" maw={420} ta="center">
					<Text c="red">This PDF could not be opened.</Text>
					<Text size="sm" c="dimmed">
						It may be damaged or use a format the viewer doesn’t
						support. Try importing it again with “Extract content”
						enabled.
					</Text>
				</Stack>
			</Center>
		);
	}

	if (!activeDocumentId || documentState?.status !== "loaded") {
		return (
			<Center h="100%">
				<Stack align="center" gap="xs">
					<Loader size="md" />
					<Text size="md" c="dimmed">
						Opening document…
					</Text>
				</Stack>
			</Center>
		);
	}

	return (
		<LoadedPdfDocument
			documentId={activeDocumentId}
			learningAssetId={learningAssetId}
			readPoint={readPoint}
		/>
	);
}

interface LoadedPdfDocumentProps extends PdfDocumentContentProps {
	documentId: string;
}

// Mounted only once the document loads: embedpdf's per-document hooks throw for a document that never opened.
function LoadedPdfDocument({
	documentId: activeDocumentId,
	learningAssetId,
	readPoint,
}: LoadedPdfDocumentProps) {
	const dispatch = useAppDispatch();

	useEffect(() => {
		dispatch(setZoomOwnedByCurrentView(true));
		return () => {
			dispatch(setZoomOwnedByCurrentView(false));
		};
	}, [dispatch]);

	usePdfAnnotationsPersistence(activeDocumentId, learningAssetId);
	usePdfZoomPersistence(activeDocumentId, learningAssetId);
	const { provides: scrollCapability } = useScrollCapability();
	const [pageFlash, setPageFlash] = useState<PdfPageFlash | null>(null);
	const pendingFlashRef = useRef<PdfPageFlash | null>(null);
	const [hideRequests, setHideRequests] = useState(0);
	// Flashes once the jump reaches the page, not while it's still scrolling there.
	// Every jump comes through here, so it also hides the header, as the text view does.
	const flashOnArrival = useCallback(
		(flash: PdfPageFlash) => {
			setHideRequests(count => count + 1);
			const currentPage = scrollCapability
				?.forDocument(activeDocumentId)
				.getCurrentPage();
			pendingFlashRef.current =
				currentPage === flash.pageNumber ? null : flash;
			if (currentPage === flash.pageNumber) setPageFlash(flash);
		},
		[scrollCapability, activeDocumentId],
	);
	useEffect(
		() =>
			scrollCapability?.onPageChange(event => {
				const pending = pendingFlashRef.current;
				if (
					event.documentId !== activeDocumentId ||
					pending?.pageNumber !== event.pageNumber
				)
					return;
				pendingFlashRef.current = null;
				setPageFlash(pending);
			}),
		[scrollCapability, activeDocumentId],
	);
	const clearPageFlash = useCallback(() => setPageFlash(null), []);
	const menuPageRef = useRef<number | null>(null);
	const setMenuPage = useCallback((pageNumber: number | null) => {
		menuPageRef.current = pageNumber;
	}, []);
	const flashReadPointPage = useCallback(
		(pageNumber: number) =>
			flashOnArrival({ pageNumber, color: READ_POINT_COLOR }),
		[flashOnArrival],
	);
	const { recordHighlightReadPoint, getCurrentPage, displayedReadPoint } =
		usePdfReadPoint({
			learningAssetId,
			documentId: activeDocumentId,
			initial: readPoint,
			onGoTo: flashReadPointPage,
			menuPageRef,
		});

	const pageCount =
		useDocumentState(activeDocumentId)?.document?.pageCount ?? 0;
	const resolveMarkAnchor = useCallback(
		(): ReadingPosition => ({
			split: menuPageRef.current ?? getCurrentPage(),
			block: 0,
		}),
		[getCurrentPage],
	);
	const goToMark = useCallback(
		(anchor: ReadingPosition, slot: MarkSlot) => {
			scrollCapability
				?.forDocument(activeDocumentId)
				.scrollToPage({ pageNumber: anchor.split, behavior: "smooth" });
			flashOnArrival({
				pageNumber: anchor.split,
				color: MARK_COLORS[slot],
			});
		},
		[scrollCapability, activeDocumentId, flashOnArrival],
	);
	const readPointPage = isNoReadPoint(displayedReadPoint)
		? null
		: displayedReadPoint.split;
	const marks = useMarks({
		learningAssetId,
		resolveSetAnchor: resolveMarkAnchor,
		goTo: goToMark,
	});
	const progressOf = useCallback(
		(anchor: ReadingPosition) => pdfAnchorProgress(anchor, pageCount),
		[pageCount],
	);
	const marksContext = useMemo(
		() => ({ marks, progressOf }),
		[marks, progressOf],
	);
	const [frame, setFrame] = useState<HTMLDivElement | null>(null);
	usePdfFindInPage(activeDocumentId);
	const selectionAnchor = usePdfSelectionAnchor(activeDocumentId);
	const linkRenderers = usePdfLinkNavigationRenderer(activeDocumentId);

	const [pinned, setPinned] = useState(true);

	return (
		// Fixed, always full-height, never resized by the header (a resize
		// makes embedpdf re-fit/recenter, felt as an extra scroll) — it overlays.
		<MarksContext value={marksContext}>
			<div
				ref={setFrame}
				style={{
					position: "fixed",
					insetInlineStart: "var(--app-shell-navbar-offset, 0rem)",
					insetInlineEnd: "var(--app-shell-aside-offset, 0rem)",
					top: 0,
					bottom: 0,
					transitionProperty: "inset-inline-start, inset-inline-end",
					transitionDuration: "var(--app-shell-transition-duration)",
					transitionTimingFunction:
						"var(--app-shell-transition-timing-function)",
					overflow: "hidden",
				}}>
				<PdfContextMenu onMenuPageChange={setMenuPage}>
					<Viewport
						documentId={activeDocumentId}
						className={styles.viewport}
						style={{
							width: "100%",
							height: "100%",
							// Inset the scrollbar below the header, same as the app's
							// own ScrollArea does for its (custom-drawn) scrollbar.
							["--pdf-viewport-scrollbar-inset-top" as string]:
								pinned
									? "var(--app-shell-header-height, 0px)"
									: "0px",
						}}>
						<ScrollWatcher
							onPinnedChange={setPinned}
							hideRequests={hideRequests}
						/>
						<ZoomGestureWrapper
							documentId={activeDocumentId}
							style={{ width: "100%", height: "100%" }}>
							<Scroller
								documentId={activeDocumentId}
								renderPage={({ pageIndex }) => (
									<PagePointerProvider
										documentId={activeDocumentId}
										pageIndex={pageIndex}
										{...{
											[PDF_PAGE_ATTRIBUTE]: pageIndex + 1,
										}}>
										{/* Without this the native image drag fires
								    pointercancel with no pointerup, leaving
								    embedpdf's text selection stuck "selecting". */}
										<RenderLayer
											documentId={activeDocumentId}
											pageIndex={pageIndex}
											draggable={false}
										/>
										<AnnotationLayer
											documentId={activeDocumentId}
											pageIndex={pageIndex}
											annotationRenderers={linkRenderers}
										/>
										<SelectionLayer
											documentId={activeDocumentId}
											pageIndex={pageIndex}
											selectionMenu={props => (
												<PdfFloatingMenu
													{...props}
													learningAssetId={
														learningAssetId
													}
													selectionAnchor={
														selectionAnchor
													}
													onHighlightCreated={
														recordHighlightReadPoint
													}
												/>
											)}
										/>
										<SearchLayer
											documentId={activeDocumentId}
											pageIndex={pageIndex}
										/>
										<PdfPageMarks
											pageNumber={pageIndex + 1}
											hasReadPoint={
												readPointPage === pageIndex + 1
											}
											flash={pageFlash}
											onFlashed={clearPageFlash}
										/>
									</PagePointerProvider>
								)}
							/>
						</ZoomGestureWrapper>
					</Viewport>
				</PdfContextMenu>
				<FindInPageBar />
				<PdfToolbar documentId={activeDocumentId} pinned={pinned} />
				<MarkScrollbarTicks
					container={frame}
					trackTop={
						pinned ? "var(--app-shell-header-height, 0px)" : "0px"
					}
					trackBottom="0px"
					readPoint={
						readPointPage === null ? null : displayedReadPoint
					}
				/>
			</div>
		</MarksContext>
	);
}
