import { useEffect, useState } from "react";
import { clippingAncestorOf } from "./gutterLayout";

/** Room (px) between `element`'s left edge and the left edge of whatever clips it, re-measured as either resizes or anything scrolls sideways. */
export function useGutterWidth(element: HTMLElement | null): number | null {
	const [width, setWidth] = useState<number | null>(null);

	useEffect(() => {
		if (!element) return;
		const clip = clippingAncestorOf(element);
		const measure = () =>
			setWidth(
				element.getBoundingClientRect().left -
					clip.getBoundingClientRect().left,
			);

		measure();
		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(measure);
		resizeObserver?.observe(element);
		resizeObserver?.observe(clip);

		// Panning a zoomed page moves it within its clip without resizing either.
		let frame: number | null = null;
		const handleScroll = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				measure();
			});
		};
		window.addEventListener("scroll", handleScroll, {
			capture: true,
			passive: true,
		});
		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener("scroll", handleScroll, {
				capture: true,
			});
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [element]);

	return width;
}
