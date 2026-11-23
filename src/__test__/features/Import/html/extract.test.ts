import { extractHtml } from "../../../../features/Import/html/extract";
import { prepareCodeBlocks } from "../../../../features/Import/normalize/codeBlocks";

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

	it("Should keep the code block's language when Defuddle drops its wrapper", () => {
		// Arrange

		const paragraph = "This is the article body. ".repeat(20);
		const page = `<html><body><article><h1>Zig</h1><p>${paragraph}</p><div class="mw-highlight mw-highlight-lang-zig"><pre><span class="kd">const</span> std = @import("std");</pre></div></article></body></html>`;

		// Act

		const { html } = extractHtml(page);

		// Assert

		const doc = new DOMParser().parseFromString(html, "text/html");
		prepareCodeBlocks(doc);
		expect(doc.querySelector("pre")?.getAttribute("data-language")).toBe(
			"zig",
		);
	});

	it("Should throw no-content when the page has no text or media", () => {
		// Arrange

		const page =
			"<html><head><title>Empty</title></head><body>  </body></html>";

		// Act & Assert

		expect(() => extractHtml(page)).toThrow("no-content");
	});
});
