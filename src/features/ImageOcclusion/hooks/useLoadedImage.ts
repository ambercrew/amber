import { useEffect, useState } from "react";

type LoadResult =
	{ src: string; image: HTMLImageElement } | { src: string; failed: true };

/** Decodes `src` into an element Konva can draw; `image` is `null` while loading. */
export function useLoadedImage(src: string) {
	const [result, setResult] = useState<LoadResult | null>(null);

	useEffect(() => {
		const element = new window.Image();
		element.onload = () => setResult({ src, image: element });
		element.onerror = () => setResult({ src, failed: true });
		element.src = src;
		return () => {
			element.onload = null;
			element.onerror = null;
		};
	}, [src]);

	// A result for a previous `src` is stale until the new one loads.
	const current = result?.src === src ? result : null;
	return {
		image: current && "image" in current ? current.image : null,
		failed: !!current && "failed" in current,
	};
}
