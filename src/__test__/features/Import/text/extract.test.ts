import { extractText } from "../../../../features/Import/text/extract";

describe("extractText", () => {
	it("Should split paragraphs on blank lines and escape html when given plain text", () => {
		// Arrange

		const text = "First <b>line</b>\r\n\r\n  \r\nSecond paragraph";

		// Act

		const actual = extractText(text);

		// Assert

		expect(actual.html).toBe(
			"<p>First &lt;b&gt;line&lt;/b&gt;</p><p>Second paragraph</p>",
		);
		expect(actual.title).toBeNull();
	});

	it("Should throw no-content when the text is blank", () => {
		// Arrange

		const text = "  \n\n \t ";

		// Act & Assert

		expect(() => extractText(text)).toThrow("no-content");
	});
});
