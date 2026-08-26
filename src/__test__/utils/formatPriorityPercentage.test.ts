import {
	formatPriorityPercentage,
	formatPriorityPercentageRange,
} from "../../utils/formatPriorityPercentage";

describe("formatPriorityPercentage", () => {
	it("Should show two decimals when the percentage is a whole number", () => {
		// Arrange

		const percentage = 50;

		// Act

		const actual = formatPriorityPercentage(percentage);

		// Assert

		expect(actual).toBe("50.00%");
	});

	it("Should round to two decimals when the percentage has more decimals", () => {
		// Arrange

		const percentage = 33.3333;

		// Act

		const actual = formatPriorityPercentage(percentage);

		// Assert

		expect(actual).toBe("33.33%");
	});
});

describe("formatPriorityPercentageRange", () => {
	it("Should show both bounds with two decimals and a single percent sign when a range is given", () => {
		// Arrange

		const min = 70;
		const max = 100;

		// Act

		const actual = formatPriorityPercentageRange(min, max);

		// Assert

		expect(actual).toBe("70.00–100.00%");
	});
});
