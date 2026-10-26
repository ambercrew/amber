import { useCallback, useState } from "react";
import { Position } from "@embedpdf/models";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useViewportCapability } from "@embedpdf/plugin-viewport/react";
import { safeAreaTopInPx } from "../../../../utils/safeArea";

export interface GoToPageOptions {
	behavior?: "smooth" | "instant";
	/** A point on the page to bring into view instead of its top, in page coordinates. */
	pageCoordinates?: Position;
	/** Where that point lands, as a percentage of the viewport's height. */
	alignY?: number;
}

/** Jumps to a 1-based page. */
export type GoToPage = (pageNumber: number, options?: GoToPageOptions) => void;

interface ReturnValue {
	goToPage: GoToPage;
	/** Bumped by each jump, so the header hides as it does when the text view jumps. */
	hideRequests: number;
}

/** The single way to jump in a PDF: scrolls to the page and hides the header. */
export function usePdfNavigator(documentId: string): ReturnValue {
	const { provides: scroll } = useScrollCapability();
	const { provides: viewport } = useViewportCapability();
	const [hideRequests, setHideRequests] = useState(0);

	const goToPage = useCallback<GoToPage>(
		(pageNumber, { behavior = "smooth", ...position } = {}) => {
			if (!scroll) return;
			// The page's top lands flush with the viewport's, so on a phone push it below the status bar.
			const safeAreaTop = safeAreaTopInPx();
			const clientHeight = viewport
				?.forDocument(documentId)
				.getMetrics().clientHeight;
			if (position.alignY === undefined && safeAreaTop && clientHeight)
				position.alignY = (safeAreaTop / clientHeight) * 100;
			scroll
				.forDocument(documentId)
				.scrollToPage({ pageNumber, behavior, ...position });
			setHideRequests(count => count + 1);
		},
		[scroll, viewport, documentId],
	);

	return { goToPage, hideRequests };
}
