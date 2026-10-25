import { ReadingPosition } from "../../../types/elements/readingPosition";

/** The sentinel value meaning "no read point" — also a learning asset's state before it has ever had one saved. */
export const NO_READ_POINT: ReadingPosition = { split: 0, block: 0 };

export function isSamePosition(
	a: ReadingPosition,
	b: ReadingPosition,
): boolean {
	return a.split === b.split && a.block === b.block;
}

export function isNoReadPoint(position: ReadingPosition): boolean {
	return isSamePosition(position, NO_READ_POINT);
}
