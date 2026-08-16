import { extractMarkdown } from "../../../../features/Import/markdown/extract";

describe("extractMarkdown", () => {
	it("Should convert markdown to html and derive the title from the first heading", () => {
		// Arrange

		const markdown = "# My Title\n\nSome paragraph.";

		// Act

		const actual = extractMarkdown(markdown);

		// Assert

		expect(actual.title).toBe("My Title");
		expect(actual.html).toContain("<h1>My Title</h1>");
		expect(actual.html).toContain("<p>Some paragraph.</p>");
		expect(actual.authors).toBeNull();
		expect(actual.publicationDate).toBeNull();
	});

	it("Should throw no-content when the markdown produces no html", () => {
		// Arrange

		const markdown = "   \n\n  ";

		// Act & Assert

		expect(() => extractMarkdown(markdown)).toThrow("no-content");
	});
});
