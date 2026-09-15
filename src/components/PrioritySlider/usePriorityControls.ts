import { useState } from "react";
import {
	clamp,
	percentileStepFor,
	percentileToPosition,
	positionToPercentile,
} from "./priorityMath";

interface UsePriorityControlsOptions {
	total: number;
	initialPosition: number;
	initialPercentile: number;
	/** Called after the user commits a new position via the "Position" input. */
	onPositionCommit: (position: number, percentile: number) => void;
	/** Called after the user commits a new percentile via the "Percentile"
	 * input or by releasing the slider. */
	onPercentileCommit: (percentile: number, position: number) => void;
}

/** Shared position/percentile conversion state behind `PrioritySlider`. Callers
 * decide what "commit" means — persisting immediately (`PriorityModal`) or
 * just holding the value for later (the import priority section). */
export function usePriorityControls({
	total,
	initialPosition,
	initialPercentile,
	onPositionCommit,
	onPercentileCommit,
}: UsePriorityControlsOptions) {
	const [position, setPosition] = useState(initialPosition);
	const [percentile, setPercentile] = useState(initialPercentile);

	function handlePositionChange(value: string | number) {
		const newPosition = clamp(Number(value) || 1, 1, total);
		const newPercentile = positionToPercentile(total, newPosition);
		setPosition(newPosition);
		setPercentile(newPercentile);
		onPositionCommit(newPosition, newPercentile);
	}

	function handlePercentileChange(value: string | number) {
		const newPercentile = clamp(Number(value) || 0, 0, 100);
		const newPosition = percentileToPosition(total, newPercentile);
		setPosition(newPosition);
		setPercentile(positionToPercentile(total, newPosition));
		onPercentileCommit(newPercentile, newPosition);
	}

	function handleSliderChange(value: number) {
		setPercentile(value);
		setPosition(percentileToPosition(total, value));
	}

	return {
		position,
		percentile,
		percentileStep: percentileStepFor(total),
		handlePositionChange,
		handlePercentileChange,
		handleSliderChange,
		handleSliderChangeEnd: handlePercentileChange,
	};
}
