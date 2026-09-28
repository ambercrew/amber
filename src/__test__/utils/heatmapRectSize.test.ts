import {
	heatmapRectSize,
	heatmapWeekCount,
	heatmapYearLayout,
} from "../../utils/heatmapRectSize";

describe("heatmapWeekCount", () => {
	it("Should count one column when both dates fall in the same week", () => {
		// Arrange

		const startDate = "2026-09-21"; // Monday
		const endDate = "2026-09-27"; // Sunday

		// Act

		const actual = heatmapWeekCount(startDate, endDate);

		// Assert

		expect(actual).toBe(1);
	});

	it("Should count the partial first and last weeks when the range spans a year", () => {
		// Arrange

		const startDate = "2025-09-27"; // Saturday
		const endDate = "2026-09-27"; // Sunday

		// Act

		const actual = heatmapWeekCount(startDate, endDate);

		// Assert

		expect(actual).toBe(53);
	});
});

describe("heatmapRectSize", () => {
	it("Should fill the width to within a pixel without overflowing when given the resulting rect size", () => {
		// Arrange

		const width = 900;
		const weeks = 53;
		const gap = 2;

		// Act

		const rectSize = heatmapRectSize(width, weeks, gap);

		// Assert

		const drawnWidth = 30 + weeks * (rectSize + gap) + gap;
		expect(drawnWidth).toBeLessThanOrEqual(width);
		expect(drawnWidth).toBeGreaterThan(width - 1);
	});
});

describe("heatmapYearLayout", () => {
	it("Should keep the whole year on one row when the squares fit", () => {
		// Arrange

		const width = 1000;

		// Act

		const actual = heatmapYearLayout(2026, width, 3, 8);

		// Assert

		expect(actual.rows).toEqual([
			{ startDate: "2026-01-01", endDate: "2026-12-31" },
		]);
		expect(actual.rectSize).toBeGreaterThanOrEqual(8);
	});

	it("Should split the year into half-year rows when one row would be too narrow", () => {
		// Arrange

		const width = 400;

		// Act

		const actual = heatmapYearLayout(2026, width, 3, 8);

		// Assert

		expect(actual.rows).toEqual([
			{ startDate: "2026-01-01", endDate: "2026-06-30" },
			{ startDate: "2026-07-01", endDate: "2026-12-31" },
		]);
		expect(actual.rectSize).toBeGreaterThanOrEqual(8);
	});

	it("Should use one month per row at the minimum size when even that doesn't fit", () => {
		// Arrange

		const width = 40;

		// Act

		const actual = heatmapYearLayout(2026, width, 3, 8);

		// Assert

		expect(actual.rows).toHaveLength(12);
		expect(actual.rectSize).toBe(8);
	});
});
