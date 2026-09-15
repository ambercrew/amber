import { positionToPercentile } from "../../../components/PrioritySlider/priorityMath";

describe("positionToPercentile", () => {
	it("Should return an exact whole-number percentile when the position maps to one", () => {
		// Arrange

		const total = 101;
		const position = 30;

		// Act

		const actual = positionToPercentile(total, position);

		// Assert

		expect(actual).toBe(29);
	});
});
