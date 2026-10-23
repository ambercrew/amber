import { CSSProperties, useEffect, useState } from "react";
import { MOTION_DURATION_MS, MOTION_EASING } from "../config/motion";
import { useMotionDuration } from "./useMotionDuration";

interface ViewRevealOptions {
	/** Pixels to the side the new view slides in from; negative is from the left. */
	offsetX?: number;
	durationMs?: number;
}

/**
 * Style that brings content in whenever `view` changes: it snaps transparent (and offset) on the switch,
 * then only the entrance is animated, so the old and new views never overlap.
 */
export function useViewReveal(
	view: string,
	{ offsetX = 0, durationMs = MOTION_DURATION_MS }: ViewRevealOptions = {},
): CSSProperties {
	const duration = useMotionDuration(durationMs);

	// Lags a frame behind `view`, so the new view paints once in its starting state before animating.
	const [revealedView, setRevealedView] = useState(view);
	useEffect(() => {
		const frame = requestAnimationFrame(() => setRevealedView(view));
		return () => cancelAnimationFrame(frame);
	}, [view]);

	const revealed = revealedView === view || duration === 0;
	return {
		opacity: revealed ? 1 : 0,
		transform:
			revealed || !offsetX ? undefined : `translateX(${offsetX}px)`,
		transition: revealed
			? `opacity ${duration}ms ${MOTION_EASING}, transform ${duration}ms ${MOTION_EASING}`
			: "none",
	};
}
