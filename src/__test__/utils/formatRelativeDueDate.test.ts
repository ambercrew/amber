import { formatRelativeDueDate } from "../../utils/formatRelativeDueDate";

const NOW = new Date("2024-01-01T00:00:00Z");

describe("formatRelativeDueDate", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("Should return Today when due date is in the past", () => {
		// Arrange

		const due = new Date(NOW.getTime() - 60_000).toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("Today");
	});

	it("Should return Today when due date equals now", () => {
		// Arrange

		const due = NOW.toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("Today");
	});

	it("Should return singular minute label when due in 1 minute", () => {
		// Arrange

		const due = new Date(NOW.getTime() + 60_000).toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("In 1 minute");
	});

	it("Should return plural minutes label when due in 45 minutes", () => {
		// Arrange

		const due = new Date(NOW.getTime() + 45 * 60_000).toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("In 45 minutes");
	});

	it("Should return singular hour label when due in 1 hour", () => {
		// Arrange

		const due = new Date(NOW.getTime() + 3_600_000).toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("In 1 hour");
	});

	it("Should return plural hours label when due in 5 hours", () => {
		// Arrange

		const due = new Date(NOW.getTime() + 5 * 3_600_000).toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("In 5 hours");
	});

	it("Should return Tomorrow when due 25 hours away", () => {
		// Arrange

		const due = new Date(NOW.getTime() + 25 * 3_600_000).toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("Tomorrow");
	});

	it("Should return Tomorrow when due at the start of tomorrow", () => {
		// Arrange

		vi.setSystemTime(new Date(2024, 0, 1, 10, 0));
		const due = new Date(2024, 0, 2).toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("Tomorrow");
	});

	it("Should return day count when due several days away", () => {
		// Arrange

		const due = new Date(NOW.getTime() + 3 * 24 * 3_600_000).toISOString();

		// Act

		const actual = formatRelativeDueDate(due);

		// Assert

		expect(actual).toBe("In 3 days");
	});
});
