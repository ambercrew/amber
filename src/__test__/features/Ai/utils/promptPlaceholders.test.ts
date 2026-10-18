import {
	adjacentPlaceholder,
	findPlaceholders,
} from "../../../../features/Ai/utils/promptPlaceholders";

const TEXT = "Explain {topic} to a {level} student";
const TOPIC = { start: 8, end: 15 };
const LEVEL = { start: 21, end: 28 };

describe("findPlaceholders", () => {
	it("Should skip double braces and multi-line braces when finding placeholders", () => {
		// Arrange

		const text = "{{literal}} {a\nb} {kept}";

		// Act

		const actual = findPlaceholders(text);

		// Assert

		expect(actual).toEqual([{ start: 18, end: 24 }]);
	});
});

describe("adjacentPlaceholder", () => {
	it("Should return the next placeholder when one is selected", () => {
		// Arrange

		const selection = TOPIC;

		// Act

		const actual = adjacentPlaceholder(TEXT, selection, false);

		// Assert

		expect(actual).toEqual(LEVEL);
	});

	it("Should return null when moving forward past the last placeholder", () => {
		// Arrange

		const selection = LEVEL;

		// Act

		const actual = adjacentPlaceholder(TEXT, selection, false);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return the previous placeholder when moving backward from one", () => {
		// Arrange

		const selection = LEVEL;

		// Act

		const actual = adjacentPlaceholder(TEXT, selection, true);

		// Assert

		expect(actual).toEqual(TOPIC);
	});

	it("Should return null when moving backward before the first placeholder", () => {
		// Arrange

		const selection = TOPIC;

		// Act

		const actual = adjacentPlaceholder(TEXT, selection, true);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return the surrounding placeholder when the caret is inside it", () => {
		// Arrange

		const selection = { start: 10, end: 10 };

		// Act

		const actual = adjacentPlaceholder(TEXT, selection, false);

		// Assert

		expect(actual).toEqual(TOPIC);
	});
});
