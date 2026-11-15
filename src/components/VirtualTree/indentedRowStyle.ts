import { CSSProperties } from "react";

/**
 * Indents a row by margin instead of Mantine's padding, so its background starts at the label
 * and the tree lines in the indent never cross it. Zeroing `--label-offset` keeps the drop indicators on the row.
 */
export function indentedRowStyle(level: number): CSSProperties {
	return {
		marginInlineStart: `calc(var(--level-offset, var(--mantine-spacing-lg)) * ${level - 1})`,
		...({ "--label-offset": "0px" } as CSSProperties),
	};
}
