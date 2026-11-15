import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { useStageEvent } from "@embedpdf/react/stage";
import { useReadingCommand } from "../../../../commands/readingCommands";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
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
	/** The read point shown, moved only by a manual set/clear; `null` when there is none. */
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
	const { place, accepts, reset } = useReadPointPlacement({
		learningAssetId,
		initial,
	});
	// Gates automatic saves until the restore has run, so its own scroll isn't saved as the reader jumping to page 1.
	const restoredRef = useRef(false);

	// The handler is re-read on every event, so it never goes stale.
	useStageEvent(
		stage => stage.onPageChanged,
		({ pageIndex }) => {
			if (restoredRef.current && accepts("automatic"))
				place({ split: pageIndex + 1, block: 0 }, "automatic");
		},
	);

	// `initial` is only meaningful for this opening's first layout.
	const restore = useEffectEvent(() => {
		restoredRef.current = true;
		if (isNoReadPoint(initial)) return;
		goToPage(Math.min(Math.max(initial.split, 1), pageCount), {
			behavior: "instant",
		});
	});
	// Once per document: `layoutReady` never turns false again, as the Viewer remounts per document.
	useEffect(() => {
		if (!layoutReady) return;
		restore();
		return () => {
			restoredRef.current = false;
			reset();
		};
	}, [layoutReady, documentId, reset]);

	const [displayed, setDisplayed] = useState(initial);

	// As in the text view, a highlight saves the read point without moving the marker.
	const placeManual = useCallback(
		(readPoint: ReadingPosition) => {
			if (place(readPoint, "manual")) setDisplayed(readPoint);
		},
		[place],
	);
	const recordExtractReadPoint = useCallback(
		(split: number) => {
			place({ split, block: 0 }, "extract");
		},
		[place],
	);
	const handleManualSet = useCallback(
		() =>
			placeManual({
				split: getMenuPage?.() ?? getCurrentPage(),
				block: 0,
			}),
		[placeManual, getMenuPage, getCurrentPage],
	);
	const handleManualClear = useCallback(
		() => placeManual(NO_READ_POINT),
		[placeManual],
	);
	useReadingCommand("set-read-point", handleManualSet);
	useReadingCommand("clear-read-point", handleManualClear);

	const shown = isNoReadPoint(displayed) ? null : displayed;
	const goTo = useCallback(
		(readPoint: ReadingPosition) => goToPage(readPoint.split),
		[goToPage],
	);
	useGoToReadPointCommand(shown, goTo);

	return { displayed: shown, recordExtractReadPoint };
}
