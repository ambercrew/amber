import { createContext, RefObject, use } from "react";
import { LearningAssetSplitMetaDto } from "../../../../types/elements/learningAssetSplitMetaDto";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { ReadingAnchors } from "./useReadingAnchors";
import { Navigate } from "./useSplitNavigator";

/** What every learning asset plugin can build on: the split stack, its geometry, and navigation. */
export interface ReaderCore {
	learningAssetId: string;
	splits: LearningAssetSplitMetaDto[];
	/** The read point saved when the learning asset was opened. */
	initialReadPoint: ReadingPosition;
	/** The app's main scroll container the splits scroll in; `null` until it mounts. */
	scrollElement: HTMLElement | null;
	/** seq of the split currently at the top of the viewport. */
	primarySeq: number;
	/** seqs that currently render a live editor. */
	mountedSeqs: Set<number>;
	/** Best-known height for a split: measured/stored, else an estimate. */
	getHeight: (seq: number, charCount: number) => number;
	/** Split `seq`'s Lexical root, whose children are its blocks — use it to find a block; `undefined` while unmounted. */
	getContentRoot: (seq: number) => HTMLElement | undefined;
	/** Split `seq`'s box in the stack (editor or placeholder) — use it to locate the split; exists even while unmounted. */
	getSplitBox: (seq: number) => HTMLElement | undefined;
	/** The only way to scroll somewhere: mounts split `seq`, waits until it's painted, then calls `land`; the latest call wins. */
	navigate: Navigate;
	/** `true` once the read point restore on open has landed; scrolling before then isn't the reader's. */
	restoredRef: RefObject<boolean>;
	/** Where the reader is: the caret, the right-clicked block and the top visible block, for "set here" actions. */
	anchors: ReadingAnchors;
}

export const ReaderCoreContext = createContext<ReaderCore | null>(null);

export function useReaderCore(): ReaderCore {
	const core = use(ReaderCoreContext);
	if (!core)
		throw new Error("useReaderCore must be used inside ReaderCoreProvider");
	return core;
}

/** The seq of the split a plugin's `SplitPlugin` is rendered in. */
export const SplitContext = createContext<number | null>(null);

export function useSplit(): number {
	const seq = use(SplitContext);
	if (seq === null) throw new Error("useSplit must be used inside a split");
	return seq;
}
