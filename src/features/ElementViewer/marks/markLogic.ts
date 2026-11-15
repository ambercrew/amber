import { MantineColor } from "@mantine/core";
import {
	LearningAssetMark,
	MarkSlot,
} from "../../../types/elements/learningAssetMark";
import { LearningAssetSplitMetaDto } from "../../../types/elements/learningAssetSplitMetaDto";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import { estimateOffsetBeforeSplit } from "../LearningAssetView/core/heights/estimateCumulativeOffset";

/** The read point's color. */
export const READ_POINT_COLOR: MantineColor = "amber";

/** Each slot's fixed color. Never amber or yellow, which belong to the read point. */
export const MARK_COLORS: Record<MarkSlot, MantineColor> = {
	1: "blue",
	2: "pink",
	3: "violet",
};

/** A slot's solid fill for its gutter flag and scrollbar tick; the menu buttons use `markButtonVars`. */
export function markFillColor(slot: MarkSlot): MantineColor {
	return `${MARK_COLORS[slot]}.7`;
}

const lightDark = (light: string, dark: string) =>
	`light-dark(${light}, ${dark})`;
const shadeOf = (color: MantineColor, shade: number) =>
	`var(--mantine-color-${color}-${shade})`;
// Dark mode's shared light tint (shade 5 at 25%) sits ~1.4:1 on the menu, so marks double it.
const darkTint = (color: MantineColor, percent: number) =>
	`color-mix(in srgb, ${shadeOf(color, 5)} ${percent}%, transparent)`;

/**
 * CSS variables for a slot's menu buttons, every state clearing WCAG AA: 4.5:1 labels, and 3:1 between
 * the filled half, the tinted half and the menu. Checked against stock Mantine blue, pink and violet.
 */
export function markButtonVars(slot: MarkSlot, filled: boolean) {
	const color = MARK_COLORS[slot];
	if (filled) {
		// White on blue-7 is 4.2:1, so light mode fills a shade darker; dark mode fills light with dark text.
		return {
			"--button-bg": lightDark(shadeOf(color, 8), shadeOf(color, 3)),
			"--button-hover": lightDark(shadeOf(color, 9), shadeOf(color, 2)),
			"--button-color": lightDark(
				"var(--mantine-color-white)",
				"var(--mantine-color-dark-7)",
			),
		};
	}
	// Mantine's light hover (shade 2) leaves shade-9 text at 4.0:1, so it only goes partway.
	return {
		"--button-bg": lightDark(shadeOf(color, 1), darkTint(color, 50)),
		"--button-hover": lightDark(
			`color-mix(in srgb, ${shadeOf(color, 2)} 35%, ${shadeOf(color, 1)})`,
			darkTint(color, 60),
		),
		"--button-color": lightDark(shadeOf(color, 9), shadeOf(color, 1)),
		"--button-hover-color": lightDark(shadeOf(color, 9), shadeOf(color, 0)),
	};
}

/** Label for jumping to the read point, e.g. "Go to read point (43% through)". */
export function goToReadPointLabel(progress: number | null): string {
	return progress === null
		? "Go to read point"
		: `Go to read point (${formatProgress(progress)})`;
}

export function findMark(
	marks: LearningAssetMark[],
	slot: MarkSlot,
): LearningAssetMark | undefined {
	return marks.find(mark => mark.slot === slot);
}

/** `marks` with `slot` placed at `anchor` (moved if already set), or removed when `anchor` is `null`. Ordered by slot. */
export function withMark(
	marks: LearningAssetMark[],
	slot: MarkSlot,
	anchor: ReadingPosition | null,
): LearningAssetMark[] {
	const others = marks.filter(mark => mark.slot !== slot);
	const next = anchor ? [...others, { slot, anchor }] : others;
	return next.sort((a, b) => a.slot - b.slot);
}

/** How far down its split `block` starts (0 to 1), assuming evenly tall blocks; past the end means the last block. */
export function blockFraction(block: number, blockCount: number): number {
	if (blockCount <= 0) return 0;
	return Math.min(block, blockCount - 1) / blockCount;
}

/** How far through a text learning asset `anchor` sits (0 to 1), estimated from split heights so it works for unmounted splits.
 * `null` when the anchored split no longer exists. */
export function textAnchorProgress(
	anchor: ReadingPosition,
	splits: LearningAssetSplitMetaDto[],
	getHeight: (seq: number, charCount: number) => number,
): number | null {
	const split = splits.find(candidate => candidate.seq === anchor.split);
	if (!split) return null;

	const total = splits.reduce(
		(sum, candidate) => sum + getHeight(candidate.seq, candidate.charCount),
		0,
	);
	if (total <= 0) return 0;

	const offset =
		estimateOffsetBeforeSplit(splits, split.seq, getHeight) +
		getHeight(split.seq, split.charCount) *
			blockFraction(anchor.block, split.blockCount);
	return offset / total;
}

/** How far through a PDF `anchor` (whose `split` is a 1-based page) sits, from 0 to 1. */
export function pdfAnchorProgress(
	anchor: ReadingPosition,
	pageCount: number,
): number | null {
	if (pageCount <= 0) return null;
	const page = Math.min(Math.max(anchor.split, 1), pageCount);
	return (page - 1) / pageCount;
}

/** `0.426` → `"43% through"`. */
export function formatProgress(progress: number): string {
	return `${Math.round(progress * 100)}% through`;
}

/** Label for placing a mark, e.g. "Set mark 2 here" or "Move mark 2 here (now 43% through)". */
export function setMarkLabel(slot: MarkSlot, progress: number | null): string {
	return progress === null
		? `Set mark ${slot} here`
		: `Move mark ${slot} here (now ${formatProgress(progress)})`;
}

/** Label for jumping to a mark, e.g. "Go to mark 2 (43% through)" or "Mark 2 isn't set". */
export function goToMarkLabel(
	slot: MarkSlot,
	isSet: boolean,
	progress: number | null,
): string {
	if (!isSet) return `Mark ${slot} isn't set`;
	return progress === null
		? `Go to mark ${slot}`
		: `Go to mark ${slot} (${formatProgress(progress)})`;
}
