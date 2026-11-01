import { useCallback } from "react";
import { useLocalStorage } from "@mantine/hooks";
import { ElementFilter } from "../../../api/savedSearches/dto/elementFilter";

const MAX_RECENT_QUERIES = 5;

function withoutIds(filters: ElementFilter[]): string {
	return JSON.stringify(filters.map(({ id: _id, ...rest }) => rest));
}

/** Whether two queries filter the same way, ignoring the filters' ids. */
export function isSameQuery(a: ElementFilter[], b: ElementFilter[]): boolean {
	return withoutIds(a) === withoutIds(b);
}

/** The last few custom queries studied, newest first, kept on this device. */
export function useRecentCustomQueries() {
	const [stored, setStored] = useLocalStorage<ElementFilter[][]>({
		key: "study.recent-custom-queries",
		defaultValue: [],
		getInitialValueInEffect: false,
	});
	// Guards against a hand-edited or outdated value.
	const recents = Array.isArray(stored) ? stored : [];

	const remember = useCallback(
		(filters: ElementFilter[]) => {
			// An empty query studies everything, which needs no shortcut.
			if (filters.length === 0) return;
			setStored(current =>
				[
					filters,
					...(Array.isArray(current) ? current : []).filter(
						query => !isSameQuery(query, filters),
					),
				].slice(0, MAX_RECENT_QUERIES),
			);
		},
		[setStored],
	);

	return { recents, remember };
}
