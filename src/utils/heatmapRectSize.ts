const MILLISECONDS_PER_DAY = 86_400_000;

/** Mantine Heatmap's default weekday label column width, in px. */
const WEEKDAY_LABELS_WIDTH = 30;

/**
 * Number of week columns Mantine's Heatmap draws from `startDate` to `endDate`
 * (both `YYYY-MM-DD`), with weeks starting on Monday.
 */
export function heatmapWeekCount(startDate: string, endDate: string): number {
	const start = Date.parse(startDate);
	const end = Date.parse(endDate);
	const daysSinceMonday = (new Date(start).getUTCDay() + 6) % 7;
	const firstMonday = start - daysSinceMonday * MILLISECONDS_PER_DAY;
	return Math.floor((end - firstMonday) / MILLISECONDS_PER_DAY / 7) + 1;
}

/** The day square size that makes a heatmap with weekday labels span `width` px,
 * rounded down so it never overflows. */
export function heatmapRectSize(
	width: number,
	weeks: number,
	gap: number,
): number {
	const size = (width - WEEKDAY_LABELS_WIDTH - gap) / weeks - gap;
	return Math.floor(size * 100) / 100;
}

/** Row counts that split a year into equal runs of whole months. */
const YEAR_ROW_COUNTS = [1, 2, 3, 4, 6, 12];

export interface HeatmapYearLayout {
	/** Each row's `YYYY-MM-DD` date range, top to bottom. */
	rows: { startDate: string; endDate: string }[];
	rectSize: number;
}

/**
 * Splits `year` into the fewest rows of whole months whose day squares are at
 * least `minRectSize` when each row spans `width` px. Falls back to one month
 * per row at `minRectSize` when even that doesn't fit.
 */
export function heatmapYearLayout(
	year: number,
	width: number,
	gap: number,
	minRectSize: number,
): HeatmapYearLayout {
	let rows: HeatmapYearLayout["rows"] = [];
	let rectSize = minRectSize;
	for (const rowCount of YEAR_ROW_COUNTS) {
		rows = yearRows(year, rowCount);
		const maxWeeks = Math.max(
			...rows.map(row => heatmapWeekCount(row.startDate, row.endDate)),
		);
		rectSize = heatmapRectSize(width, maxWeeks, gap);
		if (rectSize >= minRectSize) return { rows, rectSize };
	}
	return { rows, rectSize: Math.max(rectSize, minRectSize) };
}

function yearRows(year: number, rowCount: number) {
	const monthsPerRow = 12 / rowCount;
	return Array.from({ length: rowCount }, (_, row) => {
		const firstMonth = row * monthsPerRow;
		return {
			startDate: isoDate(Date.UTC(year, firstMonth, 1)),
			// Day 0 of the following month is the last day of this row.
			endDate: isoDate(Date.UTC(year, firstMonth + monthsPerRow, 0)),
		};
	});
}

function isoDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}
