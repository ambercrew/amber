import { splitContent } from "../../../../features/Import/utils/splitContent";

function paragraphs(count: number, startAt = 0): string {
	return Array.from(
		{ length: count },
		(_, i) => `<p>${startAt + i}</p>`,
	).join("");
}

describe("splitContent", () => {
	it("Should return the content unchanged when there are no top-level blocks", () => {
		// Arrange

		const html = "just text, no elements";

		// Act

		const actual = splitContent(html);

		// Assert

		expect(actual).toEqual([html]);
	});

	it("Should return a single split when the block count is under the target", () => {
		// Arrange

		const html = paragraphs(10);

		// Act

		const actual = splitContent(html);

		// Assert

		expect(actual).toEqual([html]);
	});

	it("Should keep a single split when the block count exceeds the target but stays under the ceiling", () => {
		// Arrange

		const html = paragraphs(150);

		// Act

		const actual = splitContent(html);

		// Assert

		expect(actual).toEqual([html]);
	});

	it("Should break before a heading found within the lookahead window past the target", () => {
		// Arrange

		const before = paragraphs(150);
		const heading = "<h2>Chapter</h2>";
		const after = paragraphs(10, 150);
		const html = before + heading + after;

		// Act

		const actual = splitContent(html);

		// Assert

		expect(actual).toEqual([before, heading + after]);
	});

	it("Should force a break at the max block ceiling when no heading is found in the lookahead window", () => {
		// Arrange

		const html = paragraphs(300);

		// Act

		const actual = splitContent(html);

		// Assert

		expect(actual).toEqual([paragraphs(200), paragraphs(100, 200)]);
	});

	it("Should never break inside a single oversized block", () => {
		// Arrange

		const hugeParagraph = `<p>${"word ".repeat(10_000)}</p>`;
		const html = hugeParagraph + paragraphs(10, 1);

		// Act

		const actual = splitContent(html);

		// Assert

		expect(actual).toEqual([html]);
	});
});
