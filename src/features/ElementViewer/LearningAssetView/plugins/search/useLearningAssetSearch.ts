import { useCallback, useEffect, useMemo, useState } from "react";
import { getLearningAssetSplitTexts } from "../../../../../api/elements/api/elementsApi";
import { findMatches } from "../../../../../components/Editor/plugins/SearchHighlightPlugin/findMatches";
import useAppSelector from "../../../../../hooks/useAppSelector";
import { selectSearchOpened } from "../../../../../stores/search/searchSelectors";
import { LearningAssetSplitMetaDto } from "../../../../../types/elements/learningAssetSplitMetaDto";

interface Props {
	learningAssetId: string;
	splits: LearningAssetSplitMetaDto[];
	query: string;
	caseSensitive: boolean;
	mountedSeqs: Set<number>;
}

export interface MatchTarget {
	seq: number;
	localIndex: number;
}

interface ReturnValue {
	/** Reports a mounted split's own, authoritative match count. */
	onSplitMatches: (splitId: string, count: number) => void;
	/** Total matches across every split, mounted or not. */
	totalMatches: number;
	/** Per-split match counts, in `splits` order — used for initial-result resolution. */
	countsBySeq: Map<number, number>;
	/** Resolves a global match index to the split (and local index within it) that owns it. */
	resolveMatchTarget: (globalIndex: number) => MatchTarget | null;
	/** Inverse of `resolveMatchTarget`: the global index of a given split + local index. */
	toGlobalIndex: (target: MatchTarget) => number;
}

// Per loaded snapshot, each split's match count for the latest search only.
const textCountCache = new WeakMap<
	Map<number, string>,
	{ searchKey: string; counts: Map<number, number> }
>();

function textMatchCount(
	texts: Map<number, string>,
	seq: number,
	query: string,
	caseSensitive: boolean,
): number {
	const searchKey = `${caseSensitive}:${query}`;
	let entry = textCountCache.get(texts);
	if (entry?.searchKey !== searchKey) {
		entry = { searchKey, counts: new Map() };
		textCountCache.set(texts, entry);
	}
	let count = entry.counts.get(seq);
	if (count === undefined) {
		count = findMatches(texts.get(seq) ?? "", query, caseSensitive).length;
		entry.counts.set(seq, count);
	}
	return count;
}

/**
 * Aggregates find-in-page match counts across every split of a learning asset, not
 * just the mounted ones. Mounted splits report their own count live via
 * `onSplitMatches`; unmounted splits are counted from a plain-text snapshot
 * fetched once, lazily, the first time search opens.
 */
export function useLearningAssetSearch({
	learningAssetId,
	splits,
	query,
	caseSensitive,
	mountedSeqs,
}: Props): ReturnValue {
	const opened = useAppSelector(selectSearchOpened);
	// State, not a ref, so counts are recomputed when the texts arrive after the query was set.
	const [loadedTexts, setLoadedTexts] = useState<{
		learningAssetId: string;
		texts: Map<number, string>;
	} | null>(null);
	const splitTexts =
		loadedTexts?.learningAssetId === learningAssetId
			? loadedTexts.texts
			: null;
	const textsLoaded = splitTexts !== null;

	// Fetched lazily, the first time search opens for this learning asset.
	useEffect(() => {
		if (!opened || textsLoaded) return;
		let cancelled = false;
		void getLearningAssetSplitTexts(learningAssetId).then(texts => {
			if (cancelled) return;
			setLoadedTexts({
				learningAssetId,
				texts: new Map(texts.map(({ seq, text }) => [seq, text])),
			});
		});
		return () => {
			cancelled = true;
		};
	}, [opened, learningAssetId, textsLoaded]);

	// What mounted splits' own editors last reported, tagged with the search they counted, so a
	// split remounting doesn't count with an earlier query's number (e.g. 0 from before searching).
	const searchKey = `${caseSensitive}:${query}`;
	const [live, setLive] = useState<{
		searchKey: string;
		counts: Map<number, number>;
	}>({ searchKey, counts: new Map() });
	const liveCounts = live.searchKey === searchKey ? live.counts : null;
	const onSplitMatches = useCallback(
		(splitId: string, count: number) => {
			const seq = Number(splitId);
			setLive(prev => {
				const counts =
					prev.searchKey === searchKey
						? prev.counts
						: new Map<number, number>();
				if (counts.get(seq) === count) return prev;
				return { searchKey, counts: new Map(counts).set(seq, count) };
			});
		},
		[searchKey],
	);

	const countsBySeq = useMemo(() => {
		const counts = new Map<number, number>();
		if (!query) return counts;
		for (const { seq } of splits) {
			const live = mountedSeqs.has(seq)
				? liveCounts?.get(seq)
				: undefined;
			// Only splits without a live count are searched in their text snapshot.
			const count =
				live ??
				(splitTexts
					? textMatchCount(splitTexts, seq, query, caseSensitive)
					: 0);
			counts.set(seq, count);
		}
		return counts;
	}, [splits, query, caseSensitive, mountedSeqs, liveCounts, splitTexts]);

	const totalMatches = splits.reduce(
		(sum, split) => sum + (countsBySeq.get(split.seq) ?? 0),
		0,
	);

	const resolveMatchTarget = useCallback(
		(globalIndex: number): MatchTarget | null => {
			if (globalIndex < 0) return null;
			let remaining = globalIndex;
			for (const split of splits) {
				const count = countsBySeq.get(split.seq) ?? 0;
				if (remaining < count) {
					return { seq: split.seq, localIndex: remaining };
				}
				remaining -= count;
			}
			return null;
		},
		[splits, countsBySeq],
	);

	const toGlobalIndex = useCallback(
		(target: MatchTarget): number => {
			let globalIndex = target.localIndex;
			for (const split of splits) {
				if (split.seq === target.seq) break;
				globalIndex += countsBySeq.get(split.seq) ?? 0;
			}
			return globalIndex;
		},
		[splits, countsBySeq],
	);

	return {
		onSplitMatches,
		totalMatches,
		countsBySeq,
		resolveMatchTarget,
		toGlobalIndex,
	};
}
