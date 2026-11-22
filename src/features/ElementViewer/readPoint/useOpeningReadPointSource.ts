import { useState } from "react";
import { useLocation } from "react-router";
import { ReadPointSource } from "../../../types/elements/readPointSource";
import { readSpotNavigationState } from "../../../types/elements/spotNavigationState";

/**
 * The precedence a learning asset opens its read point with: a review's own, else `lookup` when opened at a
 * spot (a search match, an origin link) outside its review, so looking something up doesn't move it.
 */
export function useOpeningReadPointSource(
	resumeSource: ReadPointSource | undefined,
	underReview: boolean,
): ReadPointSource | undefined {
	const location = useLocation();
	// Read once: the view mounts per learning asset, and its precedence is fixed for the visit.
	const [openedAtSpot] = useState(
		() => readSpotNavigationState(location.state).openedAtSpot === true,
	);
	if (resumeSource) return resumeSource;
	return openedAtSpot && !underReview ? "lookup" : undefined;
}
