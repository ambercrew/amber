import { useCallback, useState } from "react";
import { StageCapability } from "@embedpdf/react/stage";

export interface GoToPageOptions {
	behavior?: "smooth" | "instant";
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
		(pageNumber, { behavior = "smooth" } = {}) => {
			stage.goToPage(pageNumber - 1, { behavior });
			announceJump();
		},
		[stage, announceJump],
	);

	return { goToPage, announceJump, hideRequests };
}
