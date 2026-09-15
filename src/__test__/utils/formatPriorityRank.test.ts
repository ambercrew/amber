import {
	formatPriorityRank,
	formatPriorityRankRange,
} from "../../utils/formatPriorityRank";

describe("formatPriorityRank", () => {
	it("Should show two decimals when the rank is a whole number", () => {
		// Arrange

		const rank = 50;

		// Act

		const actual = formatPriorityRank(rank);

		// Assert

		expect(actual).toBe("50.00%");
	});

	it("Should round to two decimals when the rank has more decimals", () => {
		// Arrange

		const rank = 33.3333;

		// Act

		const actual = formatPriorityRank(rank);

		// Assert

		expect(actual).toBe("33.33%");
	});
});

describe("formatPriorityRankRange", () => {
	it("Should show both bounds with two decimals and a single percent sign when a range is given", () => {
		// Arrange

		const min = 70;
		const max = 100;

		// Act

		const actual = formatPriorityRankRange(min, max);

		// Assert

		expect(actual).toBe("70.00–100.00%");
	});
});
