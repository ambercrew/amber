import { LearningAssetHeadingDto } from "../../../../../types/elements/learningAssetHeadingDto";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";
import { TableOfContentsEntry } from "../../../../../types/elements/tableOfContentsEntry";

/** A heading's table of contents id; also how a selected entry is resolved back to its block. */
export function headingEntryId({
	seq,
	block,
}: Pick<LearningAssetHeadingDto, "seq" | "block">): string {
	return `${seq}:${block}`;
}

/** Nests headings in document order by level: each sits under the nearest heading above it of a lower level. */
export function toTableOfContents(
	headings: LearningAssetHeadingDto[],
): TableOfContentsEntry[] {
	const roots: TableOfContentsEntry[] = [];
	const open: { level: number; entry: TableOfContentsEntry }[] = [];
	for (const heading of headings) {
		const title = heading.text.trim();
		// An empty heading has nothing to show.
		if (!title) continue;
		const entry: TableOfContentsEntry = {
			id: headingEntryId(heading),
			title,
			selectable: true,
		};
		while (open.length && open[open.length - 1].level >= heading.level)
			open.pop();
		const parent = open[open.length - 1]?.entry;
		if (parent) (parent.children ??= []).push(entry);
		else roots.push(entry);
		open.push({ level: heading.level, entry });
	}
	return roots;
}

/** The id of the last non-empty heading at or before `position`, or `null` when the reader is above them all. */
export function findCurrentHeadingId(
	headings: LearningAssetHeadingDto[],
	position: ReadingPosition,
): string | null {
	let current: string | null = null;
	for (const heading of headings) {
		if (
			heading.seq > position.split ||
			(heading.seq === position.split && heading.block > position.block)
		)
			break;
		if (heading.text.trim()) current = headingEntryId(heading);
	}
	return current;
}
