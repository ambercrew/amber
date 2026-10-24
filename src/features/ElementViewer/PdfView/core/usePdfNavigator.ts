import { useCallback, useEffect, useRef, useState } from "react";
import { MantineColor } from "@mantine/core";
import { Position } from "@embedpdf/models";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useViewportCapability } from "@embedpdf/plugin-viewport/react";

export interface PdfPageFlash {
	pageNumber: number;
	color: MantineColor;
}

export interface GoToPageOptions {
	behavior?: "smooth" | "instant";
	/** Flashes the page in this color once the jump reaches it. */
	flashColor?: MantineColor;
	/** A point on the page to bring into view instead of its top, in page coordinates. */
	pageCoordinates?: Position;
	/** Where that point lands, as a percentage of the viewport's height. */
	alignY?: number;
}

/** Jumps to a 1-based page. */
export type GoToPage = (pageNumber: number, options?: GoToPageOptions) => void;

interface ReturnValue {
	goToPage: GoToPage;
	/** The flash for the page a jump landed on, until that page has played it. */
	flash: PdfPageFlash | null;
	clearFlash: () => void;
	/** Bumped by each jump, so the header hides as it does when the text view jumps. */
	hideRequests: number;
}

/** How long a smooth jump gets to start scrolling before it's taken as already there. */
export const SCROLL_START_TIMEOUT_MS = 150;

/** The single way to jump in a PDF: scrolls to the page, hides the header and flashes the page on arrival. */
export function usePdfNavigator(documentId: string): ReturnValue {
	const { provides: scroll } = useScrollCapability();
	const { provides: viewport } = useViewportCapability();
	const [flash, setFlash] = useState<PdfPageFlash | null>(null);
	const pendingFlashRef = useRef<PdfPageFlash | null>(null);
	const scrollStartTimeoutRef =
		useRef<ReturnType<typeof setTimeout>>(undefined);
	const [hideRequests, setHideRequests] = useState(0);

	// Drops the pending flash, playing it only if it's for `pageNumber` and that page is on screen (not scrolled away from).
	const land = useCallback(
		(pageNumber: number) => {
			const pending = pendingFlashRef.current;
			pendingFlashRef.current = null;
			if (!scroll || pending?.pageNumber !== pageNumber) return;
			const { visiblePages } = scroll
				.forDocument(documentId)
				.getMetrics();
			if (visiblePages.includes(pageNumber)) setFlash(pending);
		},
		[scroll, documentId],
	);

	// A page change completes once its smooth scroll settles, including one the reader interrupted.
	useEffect(
		() =>
			scroll?.onPageChangeState(event => {
				if (event.documentId === documentId && !event.state.isChanging)
					land(event.state.targetPage);
			}),
		[scroll, documentId, land],
	);

	useEffect(() => () => clearTimeout(scrollStartTimeoutRef.current), []);

	const goToPage = useCallback<GoToPage>(
		(pageNumber, { behavior = "smooth", flashColor, ...position } = {}) => {
			if (!scroll) return;
			const pending = flashColor
				? { pageNumber, color: flashColor }
				: null;
			clearTimeout(scrollStartTimeoutRef.current);
			// An instant jump completes inside `scrollToPage`, before the page is on screen, so it flashes unconditionally below.
			pendingFlashRef.current = behavior === "smooth" ? pending : null;
			scroll
				.forDocument(documentId)
				.scrollToPage({ pageNumber, behavior, ...position });

			if (behavior === "instant") {
				if (pending) setFlash(pending);
			} else if (pending) {
				// A jump to where the view already is never scrolls, so embedpdf never completes it.
				scrollStartTimeoutRef.current = setTimeout(() => {
					if (
						pendingFlashRef.current === pending &&
						!viewport?.forDocument(documentId).isScrolling()
					)
						land(pageNumber);
				}, SCROLL_START_TIMEOUT_MS);
			}
			setHideRequests(count => count + 1);
		},
		[scroll, viewport, documentId, land],
	);

	const clearFlash = useCallback(() => setFlash(null), []);

	return { goToPage, flash, clearFlash, hideRequests };
}
