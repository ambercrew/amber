// Scrolling more than a viewport within this span counts as flying past, not reading.
export const FAST_SCROLL_WINDOW_IN_MILLISECONDS = 150;
// Quiet time after a fast scroll or long jump before what it stopped on mounts.
export const SCROLL_SETTLE_IN_MILLISECONDS = 60;

export interface ScrollSampler {
	push: (top: number) => void;
	/** Whether the recent samples span more than `viewportHeight`. */
	isFast: (viewportHeight: number) => boolean;
	clear: () => void;
}

/** Scroll positions over the last `FAST_SCROLL_WINDOW`, to tell reading from flying past; shared by the text and PDF views. */
export function createScrollSampler(): ScrollSampler {
	let samples: { time: number; top: number }[] = [];
	const prune = (now: number) => {
		while (
			samples.length > 0 &&
			now - samples[0].time > FAST_SCROLL_WINDOW_IN_MILLISECONDS
		)
			samples.shift();
	};
	return {
		push: top => {
			const now = performance.now();
			samples.push({ time: now, top });
			prune(now);
		},
		isFast: viewportHeight => {
			prune(performance.now());
			return (
				samples.length >= 2 &&
				Math.abs(samples[samples.length - 1].top - samples[0].top) >
					viewportHeight
			);
		},
		clear: () => {
			samples = [];
		},
	};
}
