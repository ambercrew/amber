import { useEffect, useState } from "react";
import { StageHostCapability } from "@embedpdf/plugin-stage/contract/host";
import {
	createScrollSampler,
	SCROLL_SETTLE_IN_MILLISECONDS,
} from "../../scrollPace";

/** Whether the reader is flying past pages, so pages mounting meanwhile can skip their rendering until it settles. */
export function usePdfScrollPaceTracker(stage: StageHostCapability): {
	flying: boolean;
} {
	const [flying, setFlying] = useState(false);

	useEffect(() => {
		const sampler = createScrollSampler();
		let settleTimeout: number | null = null;

		const unsubscribe = stage.onCameraChanged(() => {
			const { scrollTop, clientHeight } = stage.getScrollMetrics();
			sampler.push(scrollTop);
			// Keeps deferring only while still flying, so slowing down to read lets the settle fire.
			if (!sampler.isFast(clientHeight)) return;
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
	}, [stage]);

	return { flying };
}
