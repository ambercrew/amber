import {
	StageHostCapability,
	StageToken as StageHostToken,
} from "@embedpdf/plugin-stage/contract/host";
import { useCapability } from "@embedpdf/react/runtime";
import { HeadroomScroller } from "../../../../hooks/useElementHeadroom";

/** The main Stage's host capability, which adds the camera's scroll metrics to `useStage()`'s. */
export function useStageHost(): StageHostCapability {
	return useCapability(StageHostToken);
}

/** The Stage as a scroll container for `useElementHeadroom`: the Stage moves a camera rather than scrolling an element. */
export class StageScroller extends EventTarget implements HeadroomScroller {
	constructor(private readonly stage: StageHostCapability) {
		super();
	}

	/** Fires `scroll` as the camera moves, until the returned function is called. */
	connect(): () => void {
		return this.stage.onCameraChanged(() =>
			this.dispatchEvent(new Event("scroll")),
		);
	}

	get scrollTop() {
		return this.stage.getScrollMetrics().scrollTop;
	}

	get scrollHeight() {
		return this.stage.getScrollMetrics().scrollHeight;
	}
}
