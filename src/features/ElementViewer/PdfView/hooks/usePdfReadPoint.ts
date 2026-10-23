import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useWindowEvent } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import useAutoSave from "../../hooks/useAutoSave";
import useApi from "../../../../hooks/useApi";
import { updateReadPoint } from "../../../../api/elements/api/elementsApi";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { READ_POINT_MANUAL_SET_REQUESTED } from "../../../../types/events/readPointManualSetRequestedEvent";
import { READ_POINT_MANUAL_CLEAR_REQUESTED } from "../../../../types/events/readPointManualClearRequestedEvent";
import { READ_POINT_MANUAL_GOTO_REQUESTED } from "../../../../types/events/readPointManualGotoRequestedEvent";

/** The sentinel value meaning "no read point" — mirrors `useReadPoint`'s `NO_READ_POINT` for text learning assets. */
export const NO_PDF_READ_POINT: ReadingPosition = { split: 0, block: 0 };

interface Props {
	learningAssetId: string;
	/** Pass `null` until the document has finished loading — the scroll
	 * plugin has no page state to read or restore into before then. */
	documentId: string | null;
	/** Read point to restore to on open. `split` is the 1-based page number; `block` is unused for PDFs. */
	initial: ReadingPosition;
	/** Called with the 1-based page a "go to read point" jump lands on. */
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
 * it on open, and wires the "Set/clear/go to read point" commands — see
 * `precedenceRef` for how manual, highlight and automatic placements interact. */
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

	const lastSavedRef = useRef<ReadingPosition>(initial);
	// Flipped to `true` once the initial restore has run (or had nothing to
	// do), gating automatic saves off it so the restore scroll itself isn't
	// recorded as the reader jumping back to page 1.
	const restoredRef = useRef(false);
	// Tracks which mechanism currently owns the read point for this opening.
	// Higher-priority placements block lower-priority ones from overwriting
	// them again, but never the other way around.
	const precedenceRef = useRef<"automatic" | "highlight" | "manual">(
		"automatic",
	);

	const { callApi } = useApi();
	const handleSave = useCallback(
		async (content: string) => {
			const readPoint = JSON.parse(content) as ReadingPosition;
			const last = lastSavedRef.current;
			if (
				last.split === readPoint.split &&
				last.block === readPoint.block
			) {
				return;
			}
			lastSavedRef.current = readPoint;
			await updateReadPoint({ learningAssetId, readPoint });
		},
		[learningAssetId],
	);
	const { onContentUpdate } = useAutoSave({ onSave: handleSave, callApi });
	const persistReadPoint = useCallback(
		(readPoint: ReadingPosition) => {
			onContentUpdate(() => JSON.stringify(readPoint));
		},
		[onContentUpdate],
	);

	useEffect(() => {
		if (!scrollCapability || !documentId) return;
		restoredRef.current = false;
		precedenceRef.current = "automatic";
		const scope = scrollCapability.forDocument(documentId);

		const unsubscribePageChange = scrollCapability.onPageChange(event => {
			if (event.documentId === documentId)
				setCurrentPage(event.pageNumber);
		});
		const unsubscribeLayoutReady = scrollCapability.onLayoutReady(event => {
			if (event.documentId !== documentId || !event.isInitial) return;
			restoredRef.current = true;
			if (initial.split === NO_PDF_READ_POINT.split) return;
			const pageNumber = Math.min(
				Math.max(initial.split, 1),
				event.totalPages,
			);
			scope.scrollToPage({ pageNumber, behavior: "instant" });
		});

		return () => {
			unsubscribePageChange();
			unsubscribeLayoutReady();
		};
		// `initial` is only meaningful for the first layout-ready of this opening.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scrollCapability, documentId]);

	useEffect(() => {
		if (!restoredRef.current || precedenceRef.current !== "automatic")
			return;
		persistReadPoint({ split: currentPage, block: 0 });
	}, [currentPage, persistReadPoint]);

	const [displayedReadPoint, setDisplayedReadPoint] = useState(initial);

	const recordHighlightReadPoint = useCallback(
		(lastPageIndex: number) => {
			// A manual placement is a deliberate bookmark; a highlight created
			// afterward shouldn't relocate it.
			if (precedenceRef.current === "manual") return;
			precedenceRef.current = "highlight";
			const readPoint = { split: lastPageIndex + 1, block: 0 };
			persistReadPoint(readPoint);
			setDisplayedReadPoint(readPoint);
		},
		[persistReadPoint],
	);

	const handleManualSet = useCallback(() => {
		precedenceRef.current = "manual";
		const readPoint = {
			split: menuPageRef?.current ?? currentPageRef.current,
			block: 0,
		};
		persistReadPoint(readPoint);
		setDisplayedReadPoint(readPoint);
	}, [persistReadPoint, menuPageRef]);

	const handleManualClear = useCallback(() => {
		precedenceRef.current = "manual";
		persistReadPoint(NO_PDF_READ_POINT);
		setDisplayedReadPoint(NO_PDF_READ_POINT);
	}, [persistReadPoint]);

	// Goes where the marker is, so the shortcut, marker and scrollbar tick agree.
	const handleManualGoto = useCallback(() => {
		const target = displayedReadPoint;
		if (target.split === NO_PDF_READ_POINT.split) {
			notifications.show({ message: "No read point set" });
			return;
		}
		if (!documentId) return;
		scrollCapability
			?.forDocument(documentId)
			.scrollToPage({ pageNumber: target.split, behavior: "smooth" });
		onGoTo?.(target.split);
	}, [displayedReadPoint, scrollCapability, documentId, onGoTo]);

	useWindowEvent(READ_POINT_MANUAL_SET_REQUESTED, handleManualSet);
	useWindowEvent(READ_POINT_MANUAL_CLEAR_REQUESTED, handleManualClear);
	useWindowEvent(READ_POINT_MANUAL_GOTO_REQUESTED, handleManualGoto);

	const getCurrentPage = useCallback(() => currentPageRef.current, []);

	return { recordHighlightReadPoint, getCurrentPage, displayedReadPoint };
}
