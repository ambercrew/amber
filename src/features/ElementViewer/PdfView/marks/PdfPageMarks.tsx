import { useEffect, useState } from "react";
import { Box } from "@mantine/core";
import { flashElement } from "../../marks/flashElement";
import GutterMarkers from "../../marks/GutterMarkers";
import { useMarksContext } from "../../marks/marksContext";
import { useGutterWidth } from "../../marks/useGutterWidth";
import { useDisplayedReadPoint } from "../../readPoint/readPointContext";
import { usePdfArrival } from "../core/pdfCoreContext";

interface PdfPageMarksProps {
	/** 1-based, matching a PDF mark's anchor. */
	pageNumber: number;
}

/** The read point and marks on one PDF page, beside its top edge, plus the flash shown when a jump lands on it. */
export default function PdfPageMarks({ pageNumber }: PdfPageMarksProps) {
	const { marks } = useMarksContext();
	const readPoint = useDisplayedReadPoint();
	const { flash, clearFlash } = usePdfArrival();
	// Covers the page, so it also measures the room beside it.
	const [pageOverlay, setPageOverlay] = useState<HTMLDivElement | null>(null);
	const gutterWidth = useGutterWidth(pageOverlay);
	const slots = marks
		.filter(mark => mark.anchor.split === pageNumber)
		.map(mark => mark.slot);

	// Cleared once played, so the page doesn't replay it when it scrolls back into view.
	useEffect(() => {
		if (flash?.pageNumber !== pageNumber || !pageOverlay) return;
		flashElement(pageOverlay, flash.color);
		clearFlash();
	}, [flash, pageNumber, pageOverlay, clearFlash]);

	return (
		<>
			<Box
				ref={setPageOverlay}
				pos="absolute"
				inset={0}
				style={{ pointerEvents: "none" }}
			/>
			<GutterMarkers
				top={0}
				gutterWidth={gutterWidth}
				readPoint={readPoint?.split === pageNumber}
				slots={slots}
			/>
		</>
	);
}
