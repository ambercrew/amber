import { useState } from "react";
import {
	clamp,
	rankStepFor,
	rankToPosition,
	positionToRank,
} from "./priorityMath";

interface UsePriorityControlsOptions {
	total: number;
	initialPosition: number;
	initialRank: number;
	/** Called after the user commits a new position via the "Position" input. */
	onPositionCommit: (position: number, rank: number) => void;
	/** Called after the user commits a new rank via the "Rank"
	 * input or by releasing the slider. */
	onRankCommit: (rank: number, position: number) => void;
}

/** Shared position/rank conversion state behind `PrioritySlider`. Callers
 * decide what "commit" means — persisting immediately (`PriorityModal`) or
 * just holding the value for later (the import priority section). */
export function usePriorityControls({
	total,
	initialPosition,
	initialRank,
	onPositionCommit,
	onRankCommit,
}: UsePriorityControlsOptions) {
	const [position, setPosition] = useState(initialPosition);
	const [rank, setRank] = useState(initialRank);

	function handlePositionChange(value: string | number) {
		const newPosition = clamp(Number(value) || 1, 1, total);
		const newRank = positionToRank(total, newPosition);
		setPosition(newPosition);
		setRank(newRank);
		onPositionCommit(newPosition, newRank);
	}

	function handleRankChange(value: string | number) {
		const newRank = clamp(Number(value) || 0, 0, 100);
		const newPosition = rankToPosition(total, newRank);
		setPosition(newPosition);
		setRank(positionToRank(total, newPosition));
		onRankCommit(newRank, newPosition);
	}

	function handleSliderChange(value: number) {
		setRank(value);
		setPosition(rankToPosition(total, value));
	}

	return {
		position,
		rank,
		rankStep: rankStepFor(total),
		handlePositionChange,
		handleRankChange,
		handleSliderChange,
		handleSliderChangeEnd: handleRankChange,
	};
}
