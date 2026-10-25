import { useChromeInsets } from "../../../App/context/chromeInsetsContext";
import MarkScrollbarTicks from "../../marks/MarkScrollbarTicks";
import { useDisplayedReadPoint } from "../../readPoint/readPointContext";

interface PdfMarksScrollbarProps {
	/** The fixed frame whose right edge holds the PDF viewport's scrollbar. */
	container: HTMLElement | null;
}

/** Ticks on the PDF's scrollbar for each set mark and the read point. */
export default function PdfMarksScrollbar({
	container,
}: PdfMarksScrollbarProps) {
	const readPoint = useDisplayedReadPoint();
	const insets = useChromeInsets();

	return (
		<MarkScrollbarTicks
			container={container}
			trackTop={insets.top}
			trackBottom={insets.bottom}
			trackTransition={insets.transition}
			readPoint={readPoint}
		/>
	);
}
