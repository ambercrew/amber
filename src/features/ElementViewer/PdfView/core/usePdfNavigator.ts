import { useCallback, useState } from "react";
import { StageCapability } from "@embedpdf/react/stage";
import { PdfViewPosition } from "../../../../types/elements/pdfViewPosition";

export interface GoToPageOptions {
	behavior?: "smooth" | "instant";
	/** Lands on this spot of the page at the current zoom, instead of the page's top. */
	position?: PdfViewPosition;
}

/** Jumps to a 1-based page. */
export type GoToPage = (pageNumber: number, options?: GoToPageOptions) => void;

interface ReturnValue {
	goToPage: GoToPage;
	/** Hides the header for a jump made some other way, such as to a search match. */
	announceJump: () => void;
	/** Bumped by each jump, so the header hides as it does when the text view jumps. */
	hideRequests: number;
}

/** The single way to jump in a PDF: moves to the page and hides the header. */
export function usePdfNavigator(stage: StageCapability): ReturnValue {
	const [hideRequests, setHideRequests] = useState(0);
	const announceJump = useCallback(
		() => setHideRequests(count => count + 1),
		[],
	);

	const goToPage = useCallback<GoToPage>(
		(pageNumber, { behavior = "smooth", position } = {}) => {
			// Keeps the zoom as it is, which the view persists on its own.
			const viewpoint = position && {
				anchor: position,
				zoom: stage.getViewpoint().zoom,
			};
			stage.goToPage(
				pageNumber - 1,
				viewpoint ? { behavior, viewpoint } : { behavior },
			);
			announceJump();
		},
		[stage, announceJump],
	);

	return { goToPage, announceJump, hideRequests };
}
