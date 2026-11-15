import { ReactNode } from "react";
import { Menu } from "@mantine/core";
import { useDocuments } from "@embedpdf/react/runtime";
import { useStage } from "@embedpdf/react/stage";
import { useIsCoarsePointer } from "../../../../hooks/useIsCoarsePointer";
import ReadingMenuItems from "../../marks/ReadingMenuItems";
import { usePdfCore } from "./pdfCoreContext";

/** The PDF's right-click menu, matching the text view's (marks and read point); notes which page it opened on. */
export default function PdfContextMenu({ children }: { children: ReactNode }) {
	const { setMenuPage } = usePdfCore();
	const stage = useStage();
	const documents = useDocuments();
	// The floating selection menu covers touch, as it does in the text view.
	const coarsePointer = useIsCoarsePointer();

	return (
		<Menu withinPortal shadow="lg" onClose={() => setMenuPage(null)}>
			<Menu.ContextMenu disabled={coarsePointer}>
				<div
					style={{ width: "100%", height: "100%" }}
					onContextMenuCapture={event => {
						// Measures the Stage itself (the only child), which sits below the safe area on mobile.
						const stageElement =
							event.currentTarget.firstElementChild ??
							event.currentTarget;
						const box = stageElement.getBoundingClientRect();
						const hit = stage.getPageAt({
							x: event.clientX - box.left,
							y: event.clientY - box.top,
						});
						const pageIndex = hit
							? documents.getPageIndex(hit.ref)
							: -1;
						setMenuPage(pageIndex >= 0 ? pageIndex + 1 : null);
					}}>
					{children}
				</div>
			</Menu.ContextMenu>
			<Menu.Dropdown>
				<ReadingMenuItems />
			</Menu.Dropdown>
		</Menu>
	);
}
