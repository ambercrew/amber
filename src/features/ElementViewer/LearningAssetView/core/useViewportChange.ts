import { useCallback, useEffect, useRef } from "react";

/** Subscribes `listener`; returns the unsubscribe. */
export type OnViewportChange = (listener: () => void) => () => void;

interface ReturnValue {
	onViewportChange: OnViewportChange;
	/** Flags that what's at the viewport top may have changed without a scroll, e.g. a split mounting. */
	notifyViewportChange: () => void;
}

/** Runs listeners once per frame after a scroll or `notifyViewportChange`, since both fire far more often than paints. */
export function useViewportChange(
	scrollElement: HTMLElement | null,
): ReturnValue {
	const listenersRef = useRef(new Set<() => void>());
	const frameRef = useRef<number | null>(null);

	const notifyViewportChange = useCallback(() => {
		if (frameRef.current !== null) return;
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			listenersRef.current.forEach(listener => listener());
		});
	}, []);

	useEffect(() => {
		if (!scrollElement) return;
		scrollElement.addEventListener("scroll", notifyViewportChange, {
			passive: true,
		});
		return () =>
			scrollElement.removeEventListener("scroll", notifyViewportChange);
	}, [scrollElement, notifyViewportChange]);

	useEffect(
		() => () => {
			if (frameRef.current !== null)
				cancelAnimationFrame(frameRef.current);
		},
		[],
	);

	const onViewportChange = useCallback<OnViewportChange>(listener => {
		listenersRef.current.add(listener);
		return () => {
			listenersRef.current.delete(listener);
		};
	}, []);

	return { onViewportChange, notifyViewportChange };
}
