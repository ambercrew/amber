import { extractHtml } from "../../../../features/Import/html/extract";

describe("extractHtml", () => {
	it("Should extract the article and title when given a saved web page", () => {
		// Arrange

		const paragraph = "This is the article body. ".repeat(20);
		const page = `<html><head><title>Saved Article</title></head><body><nav>Menu</nav><article><h1>Saved Article</h1><p>${paragraph}</p></article></body></html>`;

		// Act

		const actual = extractHtml(page);

		// Assert

		expect(actual.title).toBe("Saved Article");
		expect(actual.html).toContain("This is the article body.");
	});

	it("Should throw no-content when the page has no text or media", () => {
		// Arrange

		const page =
			"<html><head><title>Empty</title></head><body>  </body></html>";

		// Act & Assert

		expect(() => extractHtml(page)).toThrow("no-content");
	});
});
