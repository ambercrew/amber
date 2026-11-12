import { useState } from "react";
import { LinkLayer } from "@embedpdf/react/link";
import { RenderLayer } from "@embedpdf/react/render";
import { SearchLayer } from "@embedpdf/react/search";
import { SelectionLayer } from "@embedpdf/react/selection";
import PdfHighlightLayer from "../highlights/PdfHighlightLayer";
import PdfPageMarks from "../marks/PdfPageMarks";
import { usePdfScrollPace } from "./pdfCoreContext";

interface PdfPageProps {
	pageIndex: number;
}

/** One PDF page's layers, inside the Stage: the picture, links, our highlights, the text selection, search matches and marks. */
export default function PdfPage({ pageIndex }: PdfPageProps) {
	// A page only flown past stays blank, sparing its render and text layers; once live it stays live.
	const { flying } = usePdfScrollPace();
	const [live, setLive] = useState(!flying);
	if (!live && !flying) setLive(true);
	if (!live) return null;

	return (
		<>
			<RenderLayer />
			<LinkLayer />
			<PdfHighlightLayer />
			<SelectionLayer />
			<SearchLayer />
			<PdfPageMarks pageNumber={pageIndex + 1} />
		</>
	);
}
