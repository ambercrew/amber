import { useEffect, useState } from "react";
import { Box, MantineColor } from "@mantine/core";
import { flashElement } from "../../marks/flashElement";
import GutterMarkers from "../../marks/GutterMarkers";
import { useMarksContext } from "../../marks/marksContext";
import { useGutterWidth } from "../../marks/useGutterWidth";

export interface PdfPageFlash {
	pageNumber: number;
	color: MantineColor;
}

interface PdfPageMarksProps {
	/** 1-based, matching a PDF mark's anchor. */
	pageNumber: number;
	hasReadPoint: boolean;
	flash: PdfPageFlash | null;
	/** Called once `flash` has played, so the page doesn't replay it when it scrolls back into view. */
	onFlashed: () => void;
}

/** The read point and marks on one PDF page, beside its top edge, plus the flash shown when a jump to one lands on it. */
export default function PdfPageMarks({
	pageNumber,
	hasReadPoint,
	flash,
	onFlashed,
}: PdfPageMarksProps) {
	const { marks } = useMarksContext();
	// Covers the page, so it also measures the room beside it.
	const [pageOverlay, setPageOverlay] = useState<HTMLDivElement | null>(null);
	const gutterWidth = useGutterWidth(pageOverlay);
	const slots = marks
		.filter(mark => mark.anchor.split === pageNumber)
		.map(mark => mark.slot);

	useEffect(() => {
		if (flash?.pageNumber !== pageNumber || !pageOverlay) return;
		flashElement(pageOverlay, flash.color);
		onFlashed();
	}, [flash, pageNumber, pageOverlay, onFlashed]);

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
				readPoint={hasReadPoint}
				slots={slots}
			/>
		</>
	);
}
