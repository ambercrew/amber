import { useEffect, useMemo } from "react";
import { useStageEvent } from "@embedpdf/react/stage";
import {
	useElementHeadroom,
	UseElementHeadroomInput,
} from "../../../../hooks/useElementHeadroom";
import { StageScroller, useStageHost } from "./stageScroll";

/** Hide-on-scroll for the PDF's toolbar and the header, driven by the Stage's own scrolling. */
export function usePdfToolbarHeadroom(
	options: Omit<UseElementHeadroomInput, "element"> = {},
) {
	const stage = useStageHost();
	const scroller = useMemo(() => new StageScroller(stage), [stage]);
	useEffect(() => scroller.connect(), [scroller]);

	const headroom = useElementHeadroom({ element: scroller, ...options });
	const { pause } = headroom;

	// Zoom moves the camera too; don't let that hide the toolbar.
	useStageEvent(
		current => current.onZoomChanged,
		() => pause(),
	);

	return { ...headroom, scroller };
}
