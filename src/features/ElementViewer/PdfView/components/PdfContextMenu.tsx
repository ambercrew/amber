import { ReactNode } from "react";
import { Menu } from "@mantine/core";
import { useIsCoarsePointer } from "../../../../hooks/useIsCoarsePointer";
import ReadingMenuItems from "../../marks/ReadingMenuItems";

/** Marks the element holding one page, so a right-click can tell which page it landed on. */
export const PDF_PAGE_ATTRIBUTE = "data-pdf-page";

interface PdfContextMenuProps {
	/** Called with the 1-based page right-clicked to open the menu, and `null` once it closes. */
	onMenuPageChange: (pageNumber: number | null) => void;
	children: ReactNode;
}

/** The PDF's right-click menu, matching the text view's (marks and read point). */
export default function PdfContextMenu({
	onMenuPageChange,
	children,
}: PdfContextMenuProps) {
	// The floating selection menu covers touch, as it does in the text view.
	const coarsePointer = useIsCoarsePointer();

	return (
		<Menu withinPortal shadow="lg" onClose={() => onMenuPageChange(null)}>
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
						onMenuPageChange(
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
