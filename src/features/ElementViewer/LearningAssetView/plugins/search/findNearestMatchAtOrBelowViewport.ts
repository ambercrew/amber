import { LearningAssetSplitMetaDto } from "../../../../../types/elements/learningAssetSplitMetaDto";

export interface MatchTarget {
	seq: number;
	localIndex: number;
}

/** Local index of the first match at or below the viewport top in split `seq`, or `null` if none qualify. */
export type ResolveLocalMatchAtOrBelow = (seq: number) => number | null;

/**
 * Picks the match to land on when search first opens: the nearest one at or
 * below the viewport, scanning forward from `primarySeq`. Wraps to the very
 * first match overall if nothing qualifies.
 */
export function findNearestMatchAtOrBelowViewport(
	splits: LearningAssetSplitMetaDto[],
	countsBySeq: Map<number, number>,
	primarySeq: number,
	resolveLocalMatchAtOrBelow: ResolveLocalMatchAtOrBelow,
): MatchTarget | null {
	const primaryIndex = splits.findIndex(split => split.seq === primarySeq);
	const startIndex = primaryIndex === -1 ? 0 : primaryIndex;

	for (let i = startIndex; i < splits.length; i++) {
		const split = splits[i];
		const count = countsBySeq.get(split.seq) ?? 0;
		if (count === 0) continue;

		if (split.seq === primarySeq) {
			const localIndex = resolveLocalMatchAtOrBelow(split.seq);
			if (localIndex !== null) return { seq: split.seq, localIndex };
			continue;
		}

		return { seq: split.seq, localIndex: 0 };
	}

	for (const split of splits) {
		if ((countsBySeq.get(split.seq) ?? 0) > 0) {
			return { seq: split.seq, localIndex: 0 };
		}
	}

	return null;
}
