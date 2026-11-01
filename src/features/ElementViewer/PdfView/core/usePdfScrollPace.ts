import { useEffect, useState } from "react";
import { useViewportCapability } from "@embedpdf/plugin-viewport/react";
import {
	createScrollSampler,
	SCROLL_SETTLE_IN_MILLISECONDS,
} from "../../scrollPace";

/** Whether the reader is flying past pages, so pages mounting meanwhile can skip their rendering until it settles. */
export function usePdfScrollPace(documentId: string): { flying: boolean } {
	const { provides: viewport } = useViewportCapability();
	const [flying, setFlying] = useState(false);

	useEffect(() => {
		if (!viewport) return;
		const scope = viewport.forDocument(documentId);
		const sampler = createScrollSampler();
		let settleTimeout: number | null = null;

		const unsubscribe = scope.onScrollChange(({ scrollTop }) => {
			sampler.push(scrollTop);
			// Keeps deferring only while still flying, so slowing down to read lets the settle fire.
			if (!sampler.isFast(scope.getMetrics().clientHeight)) return;
			setFlying(true);
			if (settleTimeout !== null) clearTimeout(settleTimeout);
			settleTimeout = window.setTimeout(() => {
				settleTimeout = null;
				sampler.clear();
				setFlying(false);
			}, SCROLL_SETTLE_IN_MILLISECONDS);
		});
		return () => {
			unsubscribe();
			if (settleTimeout !== null) clearTimeout(settleTimeout);
		};
	}, [viewport, documentId]);

	return { flying };
}
