import { useEffect, useState } from "react";
import { Text } from "@mantine/core";
import { useDocumentState } from "@embedpdf/core/react";
import { useActiveDocument } from "@embedpdf/plugin-document-manager/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { Scroller } from "@embedpdf/plugin-scroll/react";
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react";
import { useChromeInsets } from "../../App/context/chromeInsetsContext";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { setZoomOwnedByCurrentView } from "../../../stores/elements/elementsReducer";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import FindInPageBar from "../FindInPageBar";
import PdfContextMenu from "./core/PdfContextMenu";
import PdfCoreProvider from "./core/PdfCoreProvider";
import { usePdfCore } from "./core/pdfCoreContext";
import PdfHeadroomBridge from "./core/PdfHeadroomBridge";
import PdfPage from "./core/PdfPage";
import PdfStatus from "./core/PdfStatus";
import { usePdfLinkNavigationRenderer } from "./core/usePdfLinkNavigation";
import styles from "./core/PdfViewport.module.css";
import { usePdfAnnotationsPersistence } from "./highlights/usePdfAnnotationsPersistence";
import { usePdfSelectionAnchor } from "./highlights/usePdfSelectionAnchor";
import PdfMarksProvider from "./marks/PdfMarksProvider";
import PdfMarksScrollbar from "./marks/PdfMarksScrollbar";
import PdfReadPointProvider from "./readPoint/PdfReadPointProvider";
import { usePdfFindInPage } from "./search/usePdfFindInPage";
import PdfToolbar from "./toolbar/PdfToolbar";

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
			<PdfStatus error="This PDF could not be opened.">
				<Text size="sm" c="dimmed">
					It may be damaged or use a format the viewer doesn’t
					support. Try importing it again with “Extract content”
					enabled.
				</Text>
			</PdfStatus>
		);
	}

	if (!activeDocumentId || documentState?.status !== "loaded")
		return <PdfStatus loading="Opening document…" />;

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
	documentId,
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

	usePdfAnnotationsPersistence(documentId, learningAssetId);

	// List order is nesting order, as in the text view: marks read the read point.
	return (
		<PdfCoreProvider
			learningAssetId={learningAssetId}
			documentId={documentId}
			initialReadPoint={readPoint}>
			<PdfReadPointProvider>
				<PdfMarksProvider>
					<PdfReader />
				</PdfMarksProvider>
			</PdfReadPointProvider>
		</PdfCoreProvider>
	);
}

function PdfReader() {
	const { documentId } = usePdfCore();
	usePdfFindInPage(documentId);
	const selectionAnchor = usePdfSelectionAnchor(documentId);
	const linkRenderers = usePdfLinkNavigationRenderer(documentId);
	const [frame, setFrame] = useState<HTMLDivElement | null>(null);
	const [pinned, setPinned] = useState(true);
	const insets = useChromeInsets();

	return (
		// Fixed, always full-height, never resized by the header (a resize
		// makes embedpdf re-fit/recenter, felt as an extra scroll) — it overlays.
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
			<PdfContextMenu>
				<Viewport
					documentId={documentId}
					className={styles.viewport}
					style={{
						width: "100%",
						height: "100%",
						// Clear of the header and footer, like the main scrollbar; animated by the viewport's CSS.
						["--pdf-viewport-scrollbar-inset-top" as string]:
							insets.top,
						["--pdf-viewport-scrollbar-inset-bottom" as string]:
							insets.bottom,
					}}>
					<PdfHeadroomBridge onPinnedChange={setPinned} />
					<ZoomGestureWrapper
						documentId={documentId}
						style={{ width: "100%", height: "100%" }}>
						<Scroller
							documentId={documentId}
							renderPage={({ pageIndex }) => (
								<PdfPage
									pageIndex={pageIndex}
									linkRenderers={linkRenderers}
									selectionAnchor={selectionAnchor}
								/>
							)}
						/>
					</ZoomGestureWrapper>
				</Viewport>
			</PdfContextMenu>
			<FindInPageBar />
			<PdfToolbar documentId={documentId} pinned={pinned} />
			<PdfMarksScrollbar container={frame} />
		</div>
	);
}
