import { useCallback, useState } from "react";

export interface MatchTarget {
	editorKey: string;
	localIndex: number;
}

interface ReturnValue {
	/** Reports one editor's own, authoritative match count. */
	onMatches: (editorKey: string, count: number) => void;
	/** Total matches across every editor in `editorKeys`. */
	totalMatches: number;
	/** True once every editor in `editorKeys` has reported for `countKey`. */
	countsComplete: boolean;
	/** Resolves a global match index to the editor (and local index within it) that owns it. */
	resolveMatchTarget: (globalIndex: number) => MatchTarget | null;
}

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

interface Counts {
	countKey: string;
	byEditor: ReadonlyMap<string, number>;
}

/**
 * Aggregates find-in-page match counts across a small, fixed, always-mounted
 * set of editors (an extract's editor, or a card's front/back) in
 * `editorKeys` order. Counts reported for another `countKey` (an earlier
 * element or query) are ignored, so they're never mistaken for the current ones.
 */
export function useSingleEditorSearch(
	editorKeys: string[],
	countKey = "",
): ReturnValue {
	const [counts, setCounts] = useState<Counts>({
		countKey,
		byEditor: new Map(),
	});
	// A stable key for `editorKeys`, since callers may pass a fresh array
	// literal each render.
	const editorKeysKey = editorKeys.join(",");

	// Recreated per `countKey`, so editors report again under the new one.
	const onMatches = useCallback(
		(editorKey: string, count: number) => {
			setCounts(prev => {
				const byEditor =
					prev.countKey === countKey ? prev.byEditor : NO_COUNTS;
				if (byEditor.get(editorKey) === count) return prev;
				const next = new Map(byEditor);
				next.set(editorKey, count);
				return { countKey, byEditor: next };
			});
		},
		[countKey],
	);

	const current = counts.countKey === countKey ? counts.byEditor : NO_COUNTS;

	const totalMatches = editorKeys.reduce(
		(sum, editorKey) => sum + (current.get(editorKey) ?? 0),
		0,
	);
	const countsComplete = editorKeys.every(editorKey =>
		current.has(editorKey),
	);

	const resolveMatchTarget = useCallback(
		(globalIndex: number): MatchTarget | null => {
			if (globalIndex < 0) return null;
			let remaining = globalIndex;
			for (const editorKey of editorKeys) {
				const count = current.get(editorKey) ?? 0;
				if (remaining < count)
					return { editorKey, localIndex: remaining };
				remaining -= count;
			}
			return null;
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- editorKeysKey stands in for editorKeys
		[editorKeysKey, current],
	);

	return { onMatches, totalMatches, countsComplete, resolveMatchTarget };
}
