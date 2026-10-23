import { describe, expect, it } from "vitest";
import { thumbTopFraction } from "../../../../features/ElementViewer/marks/scrollbarThumb";

const GEOMETRY = {
	scrollHeight: 2000,
	clientHeight: 500,
	trackHeight: 504,
	padding: 2,
};

describe("thumbTopFraction", () => {
	it("Should place the thumb at the top padding when scrolled to the top", () => {
		// Arrange

		const scrollTop = 0;

		// Act

		const actual = thumbTopFraction(scrollTop, GEOMETRY);

		// Assert

		expect(actual).toBeCloseTo(2 / 504);
	});

	it("Should leave the thumb's own height below it when scrolled to the bottom", () => {
		// Arrange

		const scrollTop = 1500;

		// Act

		const actual = thumbTopFraction(scrollTop, GEOMETRY);

		// Assert

		// Track 500 minus a thumb of 500 * 500 / 2000 = 125.
		expect(actual).toBeCloseTo((2 + 375) / 504);
	});

	it("Should use the minimum thumb height when the content is very long", () => {
		// Arrange

		const geometry = { ...GEOMETRY, scrollHeight: 100_000 };

		// Act

		const actual = thumbTopFraction(99_500, geometry);

		// Assert

		expect(actual).toBeCloseTo((2 + 500 - 18) / 504);
	});

	it("Should clamp to the bottom when scrolled past the end", () => {
		// Arrange

		const scrollTop = 9999;

		// Act

		const actual = thumbTopFraction(scrollTop, GEOMETRY);

		// Assert

		expect(actual).toBeCloseTo((2 + 375) / 504);
	});

	it("Should return 0 when the content doesn't scroll", () => {
		// Arrange

		const geometry = { ...GEOMETRY, scrollHeight: 500 };

		// Act

		const actual = thumbTopFraction(0, geometry);

		// Assert

		expect(actual).toBe(0);
	});
});
