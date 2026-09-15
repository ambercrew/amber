import {
	formatPriorityPercentile,
	formatPriorityPercentileRange,
} from "../../utils/formatPriorityPercentile";

describe("formatPriorityPercentile", () => {
	it("Should show two decimals when the percentile is a whole number", () => {
		// Arrange

		const percentile = 50;

		// Act

		const actual = formatPriorityPercentile(percentile);

		// Assert

		expect(actual).toBe("50.00%");
	});

	it("Should round to two decimals when the percentile has more decimals", () => {
		// Arrange

		const percentile = 33.3333;

		// Act

		const actual = formatPriorityPercentile(percentile);

		// Assert

		expect(actual).toBe("33.33%");
	});
});

describe("formatPriorityPercentileRange", () => {
	it("Should show both bounds with two decimals and a single percent sign when a range is given", () => {
		// Arrange

		const min = 70;
		const max = 100;

		// Act

		const actual = formatPriorityPercentileRange(min, max);

		// Assert

		expect(actual).toBe("70.00–100.00%");
	});
});
