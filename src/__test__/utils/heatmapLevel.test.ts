import { heatmapLevel } from "../../utils/heatmapLevel";

describe("heatmapLevel", () => {
	it.each([
		[1, 0],
		[25, 0],
		[26, 1],
		[75, 2],
		[100, 3],
	])(
		"Should return the proportional shade when the value is %i out of 100",
		(value, expected) => {
			// Arrange

			const max = 100;

			// Act

			const actual = heatmapLevel(value, max, 4);

			// Assert

			expect(actual).toBe(expected);
		},
	);

	it("Should return the lightest shade when max is zero", () => {
		// Arrange

		const max = 0;

		// Act

		const actual = heatmapLevel(0, max, 4);

		// Assert

		expect(actual).toBe(0);
	});
});
