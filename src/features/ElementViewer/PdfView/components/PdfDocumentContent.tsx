import { useEffect, useState } from "react";
import { Center, Text } from "@mantine/core";
import { useDocumentState } from "@embedpdf/core/react";
import { useActiveDocument } from "@embedpdf/plugin-document-manager/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { Scroller } from "@embedpdf/plugin-scroll/react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { SelectionLayer } from "@embedpdf/plugin-selection/react";
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react";
import { HEADROOM_FIXED_AT } from "../../../App/components/App";
import { usePdfToolbarHeadroom } from "../hooks/usePdfToolbarHeadroom";
import PdfFloatingMenu from "./PdfFloatingMenu";
import PdfToolbar from "./PdfToolbar/PdfToolbar";

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

	useEffect(() => {
		onPinnedChange(pinned);
	}, [pinned, onPinnedChange]);

	return null;
}

export default function PdfDocumentContent() {
	const { activeDocumentId } = useActiveDocument();
	const documentState = useDocumentState(activeDocumentId);

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
				<Text size="sm" c="dimmed">
					Opening document…
				</Text>
			</Center>
		);
	}

	return (
		<div
			style={{
				marginBlockStart: "calc(-1 * var(--app-shell-padding))",
				marginBlockEnd: "calc(-1 * var(--app-shell-padding))",
				marginInline: "calc(-1 * var(--app-shell-padding))",
				height: "calc(100dvh - var(--app-shell-header-height, 0px))",
				overflow: "hidden",
				position: "relative",
			}}>
			<Viewport
				documentId={activeDocumentId}
				style={{ width: "100%", height: "100%" }}>
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
								<SelectionLayer
									documentId={activeDocumentId}
									pageIndex={pageIndex}
									selectionMenu={PdfFloatingMenu}
								/>
							</PagePointerProvider>
						)}
					/>
				</ZoomGestureWrapper>
			</Viewport>
			<PdfToolbar documentId={activeDocumentId} pinned={pinned} />
		</div>
	);
}
