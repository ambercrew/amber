import { positionToRank } from "../../../components/PrioritySlider/priorityMath";

describe("positionToRank", () => {
	it("Should return an exact whole-number rank when the position maps to one", () => {
		// Arrange

		const total = 101;
		const position = 30;

		// Act

		const actual = positionToRank(total, position);

		// Assert

		expect(actual).toBe(29);
	});
});
