import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useReadingCommand } from "../../../../commands/readingCommands";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { isNoReadPoint, NO_READ_POINT } from "../../readPoint/readingPosition";
import { useReadPointPlacement } from "../../readPoint/useReadPointPlacement";

interface Props {
	learningAssetId: string;
	/** Pass `null` until the document has finished loading — the scroll
	 * plugin has no page state to read or restore into before then. */
	documentId: string | null;
	/** Read point to restore to on open. `split` is the 1-based page number; `block` is unused for PDFs. */
	initial: ReadingPosition;
	/** Called with the 1-based page a "go to read point" jump, or the restore on open, lands on. */
	onGoTo?: (pageNumber: number) => void;
	/** The page right-clicked to open the context menu, which a manual set targets over the page in view. */
	menuPageRef?: RefObject<number | null>;
}

interface ReturnValue {
	/**
	 * Called when an extract or cloze highlight is created, with the 0-based
	 * index of the highlight's last page.
	 */
	recordHighlightReadPoint: (lastPageIndex: number) => void;
	/** The 1-based page currently in view. */
	getCurrentPage: () => number;
	/** The read point as of opening, moved by a manual set/clear or a highlight but not by scroll-tracking. */
	displayedReadPoint: ReadingPosition;
}

/** Persists the read point (current page) as the user scrolls a PDF, restores
 * it on open, and handles the set/clear/go to read point commands. Which
 * placement may override which is decided by `useReadPointPlacement`. */
export function usePdfReadPoint({
	learningAssetId,
	documentId,
	initial,
	onGoTo,
	menuPageRef,
}: Props): ReturnValue {
	const { provides: scrollCapability } = useScrollCapability();

	const [currentPage, setCurrentPage] = useState(initial.split || 1);
	const currentPageRef = useRef(currentPage);
	useEffect(() => {
		currentPageRef.current = currentPage;
	}, [currentPage]);

	const { place, accepts, reset } = useReadPointPlacement({
		learningAssetId,
		initial,
	});
	// Flipped to `true` once the initial restore has run (or had nothing to
	// do), gating automatic saves off it so the restore scroll itself isn't
	// recorded as the reader jumping back to page 1.
	const restoredRef = useRef(false);
	// Read from the restore's layout-ready listener, which subscribes once per document.
	const onGoToRef = useRef(onGoTo);
	useEffect(() => {
		onGoToRef.current = onGoTo;
	}, [onGoTo]);

	useEffect(() => {
		if (!scrollCapability || !documentId) return;
		restoredRef.current = false;
		reset();
		const scope = scrollCapability.forDocument(documentId);

		const unsubscribePageChange = scrollCapability.onPageChange(event => {
			if (event.documentId === documentId)
				setCurrentPage(event.pageNumber);
		});
		const unsubscribeLayoutReady = scrollCapability.onLayoutReady(event => {
			if (event.documentId !== documentId || !event.isInitial) return;
			restoredRef.current = true;
			if (isNoReadPoint(initial)) return;
			const pageNumber = Math.min(
				Math.max(initial.split, 1),
				event.totalPages,
			);
			scope.scrollToPage({ pageNumber, behavior: "instant" });
			onGoToRef.current?.(pageNumber);
		});

		return () => {
			unsubscribePageChange();
			unsubscribeLayoutReady();
		};
		// `initial` is only meaningful for the first layout-ready of this opening.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scrollCapability, documentId]);

	useEffect(() => {
		if (!restoredRef.current || !accepts("automatic")) return;
		place({ split: currentPage, block: 0 }, "automatic");
	}, [currentPage, accepts, place]);

	const [displayedReadPoint, setDisplayedReadPoint] = useState(initial);

	// Unlike the text view, a highlight moves the marker too: its page is what the reader just read.
	const placeShown = useCallback(
		(readPoint: ReadingPosition, source: "extract" | "manual") => {
			if (place(readPoint, source)) setDisplayedReadPoint(readPoint);
		},
		[place],
	);
	const recordHighlightReadPoint = useCallback(
		(lastPageIndex: number) =>
			placeShown({ split: lastPageIndex + 1, block: 0 }, "extract"),
		[placeShown],
	);
	const handleManualSet = useCallback(
		() =>
			placeShown(
				{
					split: menuPageRef?.current ?? currentPageRef.current,
					block: 0,
				},
				"manual",
			),
		[placeShown, menuPageRef],
	);
	const handleManualClear = useCallback(
		() => placeShown(NO_READ_POINT, "manual"),
		[placeShown],
	);

	// Goes where the marker is, so the shortcut, marker and scrollbar tick agree.
	const handleManualGoto = useCallback(() => {
		const target = displayedReadPoint;
		if (isNoReadPoint(target)) {
			notifications.show({ message: "No read point set" });
			return;
		}
		if (!documentId) return;
		scrollCapability
			?.forDocument(documentId)
			.scrollToPage({ pageNumber: target.split, behavior: "smooth" });
		onGoTo?.(target.split);
	}, [displayedReadPoint, scrollCapability, documentId, onGoTo]);

	useReadingCommand("set-read-point", handleManualSet);
	useReadingCommand("clear-read-point", handleManualClear);
	useReadingCommand("go-to-read-point", handleManualGoto);

	const getCurrentPage = useCallback(() => currentPageRef.current, []);

	return { recordHighlightReadPoint, getCurrentPage, displayedReadPoint };
}
