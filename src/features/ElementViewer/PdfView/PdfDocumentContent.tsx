import { useEffect, useState } from "react";
import { Text } from "@mantine/core";
import { DocumentGate, useDocumentId } from "@embedpdf/react/runtime";
import { SelectionHandles } from "@embedpdf/react/selection";
import { Stage } from "@embedpdf/react/stage";
import { SAFE_AREA_TOP } from "../../../utils/safeArea";
import { isMobile } from "../../../utils/tauriUtils";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { setZoomOwnedByCurrentView } from "../../../stores/elements/elementsReducer";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import FindInPageBar from "../FindInPageBar";
import RemoveHighlightModal from "../RemoveHighlightModal";
import PdfContextMenu from "./core/PdfContextMenu";
import PdfCoreProvider from "./core/PdfCoreProvider";
import PdfHeadroomBridge from "./core/PdfHeadroomBridge";
import PdfPage from "./core/PdfPage";
import PdfScrollbar from "./core/PdfScrollbar";
import PdfStatus from "./core/PdfStatus";
import PdfHighlightsProvider from "./highlights/PdfHighlightsProvider";
import PdfSelectionMenu from "./highlights/PdfSelectionMenu";
import { usePdfHighlightRemoval } from "./highlights/usePdfHighlightRemoval";
import PdfMarksProvider from "./marks/PdfMarksProvider";
import PdfMarksScrollbar from "./marks/PdfMarksScrollbar";
import { usePdfOutline } from "./outline/usePdfOutline";
import PdfReadPointProvider from "./readPoint/PdfReadPointProvider";
import { usePdfFindInPage } from "./search/usePdfFindInPage";
import PdfToolbar from "./toolbar/PdfToolbar";

interface PdfDocumentContentProps {
	learningAssetId: string;
	readPoint: ReadingPosition;
}

export default function PdfDocumentContent(props: PdfDocumentContentProps) {
	return (
		<DocumentGate
			fallback={<PdfStatus loading="Opening document…" />}
			locked={() => (
				<PdfStatus error="This PDF is password-protected, which the viewer doesn’t support." />
			)}
			error={document => (
				<PdfStatus error="This PDF could not be opened.">
					<Text size="sm" c="dimmed">
						It may be damaged or use a format the viewer doesn’t
						support. Try importing it again with “Extract content”
						enabled.
						{document.error?.message
							? ` (${document.error.message})`
							: ""}
					</Text>
				</PdfStatus>
			)}>
			<LoadedPdfDocument {...props} />
		</DocumentGate>
	);
}

// Mounted only once the document is open, as the Stage and the per-document hooks need one.
function LoadedPdfDocument({
	learningAssetId,
	readPoint,
}: PdfDocumentContentProps) {
	const documentId = useDocumentId() ?? "";
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(setZoomOwnedByCurrentView(true));
		return () => {
			dispatch(setZoomOwnedByCurrentView(false));
		};
	}, [dispatch]);

	// List order is nesting order, as in the text view: marks read the read point.
	return (
		<PdfCoreProvider
			learningAssetId={learningAssetId}
			documentId={documentId}
			initialReadPoint={readPoint}>
			<PdfHighlightsProvider learningAssetId={learningAssetId}>
				<PdfReadPointProvider>
					<PdfMarksProvider>
						<PdfReader />
					</PdfMarksProvider>
				</PdfReadPointProvider>
			</PdfHighlightsProvider>
		</PdfCoreProvider>
	);
}

function PdfReader() {
	usePdfFindInPage();
	usePdfOutline();
	const { pendingRemoval, requestRemoval, confirmRemoval, cancelRemoval } =
		usePdfHighlightRemoval();
	const [frame, setFrame] = useState<HTMLDivElement | null>(null);
	const [pinned, setPinned] = useState(true);
	const [hovered, setHovered] = useState(false);

	return (
		// Fixed, always full-height, never resized by the header (a resize
		// makes the Stage re-fit, felt as an extra scroll) — it overlays.
		<div
			ref={setFrame}
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
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
			<PdfHeadroomBridge onPinnedChange={setPinned} />
			<PdfContextMenu>
				<Stage
					style={{
						width: "100%",
						height: isMobile()
							? `calc(100% - ${SAFE_AREA_TOP})`
							: "100%",
						marginTop: isMobile() ? SAFE_AREA_TOP : undefined,
						// The trough the pages rest on, so they don't blend into the app background.
						backgroundColor: "var(--pdf-viewport-bg)",
					}}
					overlay={
						<>
							<PdfScrollbar hovered={hovered} />
							<SelectionHandles />
							<PdfSelectionMenu
								onConfirmRemoval={requestRemoval}
							/>
						</>
					}>
					{page => <PdfPage pageIndex={page.pageIndex} />}
				</Stage>
			</PdfContextMenu>
			<FindInPageBar />
			<RemoveHighlightModal
				removal={pendingRemoval}
				onConfirm={confirmRemoval}
				onClose={cancelRemoval}
			/>
			<PdfToolbar pinned={pinned} />
			<PdfMarksScrollbar container={frame} />
		</div>
	);
}
