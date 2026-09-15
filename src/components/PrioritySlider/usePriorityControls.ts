import { useState } from "react";
import {
	clamp,
	percentileStepFor,
	percentileToRank,
	rankToPercentile,
} from "./priorityMath";

interface UsePriorityControlsOptions {
	total: number;
	initialRank: number;
	initialPercentile: number;
	/** Called after the user commits a new position via the "Position" input. */
	onRankCommit: (rank: number, percentile: number) => void;
	/** Called after the user commits a new percentile via the "Rank"
	 * input or by releasing the slider. */
	onPercentileCommit: (percentile: number, rank: number) => void;
}

/** Shared rank/percentile conversion state behind `PrioritySlider`. Callers
 * decide what "commit" means — persisting immediately (`PriorityModal`) or
 * just holding the value for later (the import priority section). */
export function usePriorityControls({
	total,
	initialRank,
	initialPercentile,
	onRankCommit,
	onPercentileCommit,
}: UsePriorityControlsOptions) {
	const [rank, setRank] = useState(initialRank);
	const [percentile, setPercentile] = useState(initialPercentile);

	function handleRankChange(value: string | number) {
		const newRank = clamp(Number(value) || 1, 1, total);
		const newPercentile = rankToPercentile(total, newRank);
		setRank(newRank);
		setPercentile(newPercentile);
		onRankCommit(newRank, newPercentile);
	}

	function handlePercentileChange(value: string | number) {
		const newPercentile = clamp(Number(value) || 0, 0, 100);
		const newRank = percentileToRank(total, newPercentile);
		setRank(newRank);
		setPercentile(rankToPercentile(total, newRank));
		onPercentileCommit(newPercentile, newRank);
	}

	function handleSliderChange(value: number) {
		setPercentile(value);
		setRank(percentileToRank(total, value));
	}

	return {
		rank,
		percentile,
		percentileStep: percentileStepFor(total),
		handleRankChange,
		handlePercentileChange,
		handleSliderChange,
		handleSliderChangeEnd: handlePercentileChange,
	};
}
