import {
	toDateInputValue,
	fromDateInputValue,
} from "../../utils/dateInputValue";
import dayjs from "dayjs";

describe("toDateInputValue", () => {
	it("Should return null when the value is null", () => {
		// Arrange, Act

		const actual = toDateInputValue(null);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return YYYY-MM-DD HH:mm:ss for a valid ISO timestamp", () => {
		// Arrange

		const iso = "2026-06-15T12:30:00.000Z";

		// Act

		const actual = toDateInputValue(iso);

		// Assert

		expect(actual).toBe(dayjs(iso).format("YYYY-MM-DD HH:mm:ss"));
	});

	it("Should return null when the value is not a valid date", () => {
		// Arrange, Act

		const actual = toDateInputValue("not-a-date");

		// Assert

		expect(actual).toBeNull();
	});
});

describe("fromDateInputValue", () => {
	it("Should return the given local datetime as a UTC ISO string", () => {
		// Arrange

		const value = "2026-06-15 14:30:00";

		// Act

		const actual = fromDateInputValue(value);

		// Assert

		expect(actual).toBe(
			dayjs(new Date(2026, 5, 15, 14, 30, 0)).toISOString(),
		);
	});

	it("Should treat a date-only value as local midnight", () => {
		// Arrange

		const value = "2026-06-15";

		// Act

		const actual = fromDateInputValue(value);

		// Assert

		expect(actual).toBe(dayjs(new Date(2026, 5, 15)).toISOString());
	});
});
