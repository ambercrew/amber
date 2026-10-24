import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useReadingCommand } from "../../../../commands/readingCommands";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { READ_POINT_COLOR } from "../../marks/markLogic";
import { isNoReadPoint, NO_READ_POINT } from "../../readPoint/readingPosition";
import { useGoToReadPointCommand } from "../../readPoint/useGoToReadPointCommand";
import { useReadPointPlacement } from "../../readPoint/useReadPointPlacement";
import { GoToPage } from "../core/usePdfNavigator";

interface Props {
	learningAssetId: string;
	documentId: string;
	/** Read point to restore to on open. `split` is the 1-based page number; `block` is unused for PDFs. */
	initial: ReadingPosition;
	/** Set once the first layout is ready, which is when the restore runs. */
	layoutReady: boolean;
	pageCount: number;
	goToPage: GoToPage;
	/** The 1-based page in view. */
	getCurrentPage: () => number;
	/** The page right-clicked to open the context menu, which a manual set targets over the page in view. */
	getMenuPage?: () => number | null;
}

interface ReturnValue {
	/** The read point shown, moved by a manual set/clear or a highlight but not by scroll-tracking; `null` when there is none. */
	displayed: ReadingPosition | null;
	/** Moves the read point to page `split` (1-based) after a highlight made there, if nothing outranks it. */
	recordExtractReadPoint: (split: number) => void;
}

/** Saves the page in view as the read point, restores it on open, and handles the read point commands. */
export function usePdfReadPoint({
	learningAssetId,
	documentId,
	initial,
	layoutReady,
	pageCount,
	goToPage,
	getCurrentPage,
	getMenuPage,
}: Props): ReturnValue {
	const { provides: scrollCapability } = useScrollCapability();

	const { place, accepts, reset } = useReadPointPlacement({
		learningAssetId,
		initial,
	});
	// Gates automatic saves until the restore has run, so its own scroll isn't saved as the reader jumping to page 1.
	const restoredRef = useRef(false);

	const handlePageChange = useEffectEvent((pageNumber: number) => {
		if (restoredRef.current && accepts("automatic"))
			place({ split: pageNumber, block: 0 }, "automatic");
	});
	useEffect(
		() =>
			scrollCapability?.onPageChange(event => {
				if (event.documentId === documentId)
					handlePageChange(event.pageNumber);
			}),
		[scrollCapability, documentId],
	);

	// `initial` is only meaningful for this opening's first layout.
	const restore = useEffectEvent(() => {
		restoredRef.current = true;
		if (isNoReadPoint(initial)) return;
		goToPage(Math.min(Math.max(initial.split, 1), pageCount), {
			behavior: "instant",
			flashColor: READ_POINT_COLOR,
		});
	});
	// Once per document: `layoutReady` only turns false again for another document.
	useEffect(() => {
		if (!layoutReady) return;
		restore();
		return () => {
			restoredRef.current = false;
			reset();
		};
	}, [layoutReady, documentId, reset]);

	const [displayed, setDisplayed] = useState(initial);

	// Unlike the text view, a highlight moves the marker too: its page is what the reader just read.
	const placeShown = useCallback(
		(readPoint: ReadingPosition, source: "extract" | "manual") => {
			if (place(readPoint, source)) setDisplayed(readPoint);
		},
		[place],
	);
	const recordExtractReadPoint = useCallback(
		(split: number) => placeShown({ split, block: 0 }, "extract"),
		[placeShown],
	);
	const handleManualSet = useCallback(
		() =>
			placeShown(
				{
					split: getMenuPage?.() ?? getCurrentPage(),
					block: 0,
				},
				"manual",
			),
		[placeShown, getMenuPage, getCurrentPage],
	);
	const handleManualClear = useCallback(
		() => placeShown(NO_READ_POINT, "manual"),
		[placeShown],
	);
	useReadingCommand("set-read-point", handleManualSet);
	useReadingCommand("clear-read-point", handleManualClear);

	const shown = isNoReadPoint(displayed) ? null : displayed;
	const goTo = useCallback(
		(readPoint: ReadingPosition) =>
			goToPage(readPoint.split, { flashColor: READ_POINT_COLOR }),
		[goToPage],
	);
	useGoToReadPointCommand(shown, goTo);

	return { displayed: shown, recordExtractReadPoint };
}
