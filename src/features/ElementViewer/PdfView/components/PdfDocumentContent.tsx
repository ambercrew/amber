import { useEffect, useState } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { useDocumentState } from "@embedpdf/core/react";
import { useActiveDocument } from "@embedpdf/plugin-document-manager/react";
import { AnnotationLayer } from "@embedpdf/plugin-annotation/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { Scroller } from "@embedpdf/plugin-scroll/react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { SelectionLayer } from "@embedpdf/plugin-selection/react";
import { SearchLayer } from "@embedpdf/plugin-search/react";
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react";
import { HEADROOM_FIXED_AT } from "../../../App/components/App";
import { useSetHeadroomOverride } from "../../../App/context/headroomOverrideContext";
import { ReadPoint } from "../../../../types/elements/readPoint";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { setZoomOwnedByCurrentView } from "../../../../stores/elements/elementsReducer";
import FindInPageBar from "../../FindInPageBar";
import { usePdfAnnotationsPersistence } from "../hooks/usePdfAnnotationsPersistence";
import { usePdfFindInPage } from "../hooks/usePdfFindInPage";
import { usePdfLinkNavigationRenderer } from "../hooks/usePdfLinkNavigation";
import { usePdfReadPoint } from "../hooks/usePdfReadPoint";
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
}: {
	onPinnedChange: (pinned: boolean) => void;
}) {
	const { pinned } = usePdfToolbarHeadroom({ fixedAt: HEADROOM_FIXED_AT });
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
	readPoint: ReadPoint;
}

export default function PdfDocumentContent({
	learningAssetId,
	readPoint,
}: PdfDocumentContentProps) {
	const dispatch = useAppDispatch();
	const { activeDocumentId } = useActiveDocument();
	const documentState = useDocumentState(activeDocumentId);
	const isLoaded = documentState?.status === "loaded";

	useEffect(() => {
		dispatch(setZoomOwnedByCurrentView(true));
		return () => {
			dispatch(setZoomOwnedByCurrentView(false));
		};
	}, [dispatch]);

	usePdfAnnotationsPersistence(activeDocumentId, learningAssetId);
	usePdfZoomPersistence(
		isLoaded ? (activeDocumentId ?? null) : null,
		learningAssetId,
	);
	const { recordHighlightReadPoint } = usePdfReadPoint({
		learningAssetId,
		documentId: isLoaded ? (activeDocumentId ?? null) : null,
		initial: readPoint,
	});
	usePdfFindInPage(isLoaded ? (activeDocumentId ?? null) : null);
	const linkRenderers = usePdfLinkNavigationRenderer(
		isLoaded ? (activeDocumentId ?? null) : null,
	);

	const [pinned, setPinned] = useState(true);

	if (documentState?.status === "error") {
		return (
			<Center h="100%">
				<Text c="red">Could not load the PDF.</Text>
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
		// Fixed, always full-height, never resized by the header (a resize
		// makes embedpdf re-fit/recenter, felt as an extra scroll) — it overlays.
		<div
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
			<Viewport
				documentId={activeDocumentId}
				className={styles.viewport}
				style={{
					width: "100%",
					height: "100%",
					// Inset the scrollbar below the header, same as the app's
					// own ScrollArea does for its (custom-drawn) scrollbar.
					["--pdf-viewport-scrollbar-inset-top" as string]: pinned
						? "var(--app-shell-header-height, 0px)"
						: "0px",
				}}>
				<ScrollWatcher onPinnedChange={setPinned} />
				<ZoomGestureWrapper
					documentId={activeDocumentId}
					style={{ width: "100%", height: "100%" }}>
					<Scroller
						documentId={activeDocumentId}
						renderPage={({ pageIndex }) => (
							<PagePointerProvider
								documentId={activeDocumentId}
								pageIndex={pageIndex}>
								<RenderLayer
									documentId={activeDocumentId}
									pageIndex={pageIndex}
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
											learningAssetId={learningAssetId}
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
							</PagePointerProvider>
						)}
					/>
				</ZoomGestureWrapper>
			</Viewport>
			<FindInPageBar />
			<PdfToolbar documentId={activeDocumentId} pinned={pinned} />
		</div>
	);
}
