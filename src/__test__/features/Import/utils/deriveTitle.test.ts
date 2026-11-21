import { deriveTitle } from "../../../../features/Import/utils/deriveTitle";

describe("deriveTitle", () => {
	it("Should return the heading text when a heading is present", () => {
		// Arrange

		const html = "<h2>My Article Title</h2><p>Some body text.</p>";

		// Act

		const actual = deriveTitle(html, "fallback");

		// Assert

		expect(actual).toBe("My Article Title");
	});

	it("Should prefer the first heading when multiple headings are present", () => {
		// Arrange

		const html = "<h1>First</h1><h2>Second</h2>";

		// Act

		const actual = deriveTitle(html, "fallback");

		// Assert

		expect(actual).toBe("First");
	});

	it("Should return the first words of the first paragraph when no heading is present", () => {
		// Arrange

		const html = "<p>one two three four five six seven eight nine ten</p>";

		// Act

		const actual = deriveTitle(html, "fallback");

		// Assert

		expect(actual).toBe("one two three four five six seven eight");
	});

	it("Should return the fallback text when neither heading nor paragraph text is present", () => {
		// Arrange

		const html = "<div></div>";

		// Act

		const actual = deriveTitle(html, "fallback text used here");

		// Assert

		expect(actual).toBe("fallback text used here");
	});

	it("Should return Untitled when heading, paragraph, and fallback are all empty", () => {
		// Arrange

		const html = "<div></div>";

		// Act

		const actual = deriveTitle(html, "");

		// Assert

		expect(actual).toBe("Untitled");
	});

	it("Should ignore a heading that is present but empty", () => {
		// Arrange

		const html = "<h1></h1><p>real paragraph text</p>";

		// Act

		const actual = deriveTitle(html, "fallback");

		// Assert

		expect(actual).toBe("real paragraph text");
	});

	it("Should ignore a paragraph that is present but empty and fall back to fallback text", () => {
		// Arrange

		const html = "<p></p>";

		// Act

		const actual = deriveTitle(html, "fallback text");

		// Assert

		expect(actual).toBe("fallback text");
	});
});
