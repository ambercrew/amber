import { useState } from "react";
import { Box } from "@mantine/core";
import GutterMarkers from "../../marks/GutterMarkers";
import { useMarksContext } from "../../marks/marksContext";
import { useGutterWidth } from "../../marks/useGutterWidth";
import { useDisplayedReadPoint } from "../../readPoint/readPointContext";

interface PdfPageMarksProps {
	/** 1-based, matching a PDF mark's anchor. */
	pageNumber: number;
}

/** The read point and marks on one PDF page, beside its top edge. */
export default function PdfPageMarks({ pageNumber }: PdfPageMarksProps) {
	const { marks } = useMarksContext();
	const readPoint = useDisplayedReadPoint();
	// Covers the page, so it also measures the room beside it.
	const [pageOverlay, setPageOverlay] = useState<HTMLDivElement | null>(null);
	const gutterWidth = useGutterWidth(pageOverlay);
	const slots = marks
		.filter(mark => mark.anchor.split === pageNumber)
		.map(mark => mark.slot);

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
