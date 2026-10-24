import { ReactNode } from "react";
import { Menu } from "@mantine/core";
import { useIsCoarsePointer } from "../../../../hooks/useIsCoarsePointer";
import ReadingMenuItems from "../../marks/ReadingMenuItems";
import { usePdfCore } from "./pdfCoreContext";

/** Marks the element holding one page, so a right-click can tell which page it landed on. */
export const PDF_PAGE_ATTRIBUTE = "data-pdf-page";

/** The PDF's right-click menu, matching the text view's (marks and read point); notes which page it opened on. */
export default function PdfContextMenu({ children }: { children: ReactNode }) {
	const { setMenuPage } = usePdfCore();
	// The floating selection menu covers touch, as it does in the text view.
	const coarsePointer = useIsCoarsePointer();

	return (
		<Menu withinPortal shadow="lg" onClose={() => setMenuPage(null)}>
			<Menu.ContextMenu disabled={coarsePointer}>
				<div
					style={{ width: "100%", height: "100%" }}
					onContextMenuCapture={event => {
						const page =
							event.target instanceof Element
								? event.target.closest(
										`[${PDF_PAGE_ATTRIBUTE}]`,
									)
								: null;
						setMenuPage(
							page
								? Number(page.getAttribute(PDF_PAGE_ATTRIBUTE))
								: null,
						);
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
