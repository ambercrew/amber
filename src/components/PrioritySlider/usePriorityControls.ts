import { useState } from "react";
import {
	clamp,
	percentageStepFor,
	percentageToRank,
	rankToPercentage,
} from "./priorityMath";

interface UsePriorityControlsOptions {
	total: number;
	initialRank: number;
	initialPercentage: number;
	/** Called after the user commits a new position via the "Position" input. */
	onRankCommit: (rank: number, percentage: number) => void;
	/** Called after the user commits a new percentage via the "Percentage"
	 * input or by releasing the slider. */
	onPercentageCommit: (percentage: number, rank: number) => void;
}

/** Shared rank/percentage conversion state behind `PrioritySlider`. Callers
 * decide what "commit" means — persisting immediately (`PriorityModal`) or
 * just holding the value for later (the import priority section). */
export function usePriorityControls({
	total,
	initialRank,
	initialPercentage,
	onRankCommit,
	onPercentageCommit,
}: UsePriorityControlsOptions) {
	const [rank, setRank] = useState(initialRank);
	const [percentage, setPercentage] = useState(initialPercentage);

	function handleRankChange(value: string | number) {
		const newRank = clamp(Number(value) || 1, 1, total);
		const newPercentage = rankToPercentage(total, newRank);
		setRank(newRank);
		setPercentage(newPercentage);
		onRankCommit(newRank, newPercentage);
	}

	function handlePercentageChange(value: string | number) {
		const newPercentage = clamp(Number(value) || 0, 0, 100);
		const newRank = percentageToRank(total, newPercentage);
		setRank(newRank);
		setPercentage(rankToPercentage(total, newRank));
		onPercentageCommit(newPercentage, newRank);
	}

	function handleSliderChange(value: number) {
		setPercentage(value);
		setRank(percentageToRank(total, value));
	}

	return {
		rank,
		percentage,
		percentageStep: percentageStepFor(total),
		handleRankChange,
		handlePercentageChange,
		handleSliderChange,
		handleSliderChangeEnd: handlePercentageChange,
	};
}
