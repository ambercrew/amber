import { createContext, use } from "react";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";

interface ReadPointContextValue {
	/** The read point shown on screen (gutter marker, scrollbar tick), or `null` when there is none. */
	displayed: ReadingPosition | null;
	/** Moves the read point to the end of an extract made in split `seq`, if nothing outranks it. */
	recordExtractReadPoint: (seq: number, block: number) => void;
}

export const ReadPointContext = createContext<ReadPointContextValue | null>(
	null,
);

function useReadPointContext(): ReadPointContextValue {
	const value = use(ReadPointContext);
	if (!value)
		throw new Error(
			"ReadPointContext must be used inside ReadPointProvider",
		);
	return value;
}

export function useDisplayedReadPoint(): ReadingPosition | null {
	return useReadPointContext().displayed;
}

export function useRecordExtractReadPoint() {
	return useReadPointContext().recordExtractReadPoint;
}
