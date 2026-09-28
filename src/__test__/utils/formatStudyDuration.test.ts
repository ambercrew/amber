import { formatStudyDuration } from "../../utils/formatStudyDuration";

describe("formatStudyDuration", () => {
	it("Should omit seconds when the duration is whole minutes", () => {
		// Arrange

		const durationMs = 45 * 60_000;

		// Act

		const actual = formatStudyDuration(durationMs);

		// Assert

		expect(actual).toBe("45 min");
	});

	it("Should show hours and minutes when the duration is over an hour", () => {
		// Arrange

		const durationMs = 65 * 60_000;

		// Act

		const actual = formatStudyDuration(durationMs);

		// Assert

		expect(actual).toBe("1 h 5 min");
	});

	it("Should omit minutes when the duration is whole hours", () => {
		// Arrange

		const durationMs = 2 * 60 * 60_000;

		// Act

		const actual = formatStudyDuration(durationMs);

		// Assert

		expect(actual).toBe("2 h");
	});

	it("Should show seconds only when the duration is under a minute", () => {
		// Arrange

		const durationMs = 20_999;

		// Act

		const actual = formatStudyDuration(durationMs);

		// Assert

		expect(actual).toBe("20 s");
	});

	it("Should show zero seconds when the duration is zero", () => {
		// Arrange

		const durationMs = 0;

		// Act

		const actual = formatStudyDuration(durationMs);

		// Assert

		expect(actual).toBe("0 s");
	});

	it("Should show minutes and seconds when the duration is under an hour", () => {
		// Arrange

		const durationMs = (12 * 60 + 5) * 1_000;

		// Act

		const actual = formatStudyDuration(durationMs);

		// Assert

		expect(actual).toBe("12 min 5 s");
	});
});
