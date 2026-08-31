import { useEffect, useRef, useState } from "react";
import { getPriorityQueueSize } from "../../../api/elements/api/elementsApi";
import { percentageToRank } from "../../../components/PrioritySlider/priorityMath";
import { DEFAULT_IMPORT_PRIORITY_PERCENTAGE } from "../importContext";

/** Queue size (including the element about to be created) and the rank
 * within it new imports will take. Fetched once per time the import modal
 * opens so the default (~50%) is ready before the user ever touches the
 * collapsible priority section. */
export function useImportPriority(opened: boolean) {
	const [total, setTotal] = useState<number | null>(null);
	const [rank, setRank] = useState<number | null>(null);
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
				setRank(
					percentageToRank(
						newTotal,
						DEFAULT_IMPORT_PRIORITY_PERCENTAGE,
					),
				);
			}
		});
	}, [opened]);

	function handleRankChange(newRank: number) {
		customizedRef.current = true;
		setRank(newRank);
	}

	async function resolveRank(): Promise<number> {
		if (rank !== null) return rank;
		const resolvedTotal = await fetchTotal();
		return percentageToRank(
			resolvedTotal,
			DEFAULT_IMPORT_PRIORITY_PERCENTAGE,
		);
	}

	function reset() {
		setTotal(null);
		setRank(null);
		customizedRef.current = false;
		totalFetchRef.current = null;
	}

	return { total, rank, handleRankChange, resolveRank, reset };
}
