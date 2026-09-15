import { useEffect, useRef, useState } from "react";
import { getPriorityQueueSize } from "../../../api/elements/api/elementsApi";
import { percentileToPosition } from "../../../components/PrioritySlider/priorityMath";
import { DEFAULT_IMPORT_PRIORITY_PERCENTILE } from "../importContext";

/** Queue size (including the element about to be created) and the position
 * within it new imports will take. Fetched once per time the import modal
 * opens so the default (~50%) is ready before the user ever touches the
 * collapsible priority section. */
export function useImportPriority(opened: boolean) {
	const [total, setTotal] = useState<number | null>(null);
	const [position, setPosition] = useState<number | null>(null);
	const customizedRef = useRef(false);
	const totalFetchRef = useRef<Promise<number> | null>(null);

	function fetchTotal(): Promise<number> {
		// Falls back to the front of the queue if the fetch fails, rather than
		// letting a priority-placement hiccup block the import itself.
		totalFetchRef.current ??= getPriorityQueueSize()
			.then(size => size + 1)
			.catch(() => 1);
		return totalFetchRef.current;
	}

	useEffect(() => {
		if (!opened) return;
		void fetchTotal().then(newTotal => {
			setTotal(newTotal);
			if (!customizedRef.current) {
				setPosition(
					percentileToPosition(
						newTotal,
						DEFAULT_IMPORT_PRIORITY_PERCENTILE,
					),
				);
			}
		});
	}, [opened]);

	function handlePositionChange(newPosition: number) {
		customizedRef.current = true;
		setPosition(newPosition);
	}

	async function resolvePosition(): Promise<number> {
		if (position !== null) return position;
		const resolvedTotal = await fetchTotal();
		return percentileToPosition(
			resolvedTotal,
			DEFAULT_IMPORT_PRIORITY_PERCENTILE,
		);
	}

	function reset() {
		setTotal(null);
		setPosition(null);
		customizedRef.current = false;
		totalFetchRef.current = null;
	}

	return { total, position, handlePositionChange, resolvePosition, reset };
}
