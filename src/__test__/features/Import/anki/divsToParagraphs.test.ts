import { divsToParagraphs } from "../../../../features/Import/anki/divsToParagraphs";

describe("divsToParagraphs", () => {
	it("Should turn lines laid out in divs into paragraphs when they hold inline content", () => {
		// Arrange

		const html =
			'<div class="header">idé <span>substantiv</span></div><div>1. tanke</div>';

		// Act

		const actual = divsToParagraphs(html);

		// Assert

		expect(actual).toBe(
			"<p>idé <span>substantiv</span></p><p>1. tanke</p>",
		);
	});

	it("Should unwrap a container when it holds other blocks", () => {
		// Arrange

		const html =
			"<article><header>Answer</header><div><p>B</p><ul><li>x</li></ul></div></article>";

		// Act

		const actual = divsToParagraphs(html);

		// Assert

		expect(actual).toBe("<p>Answer</p><p>B</p><ul><li>x</li></ul>");
	});

	it("Should end a container with a line break when it sits inside a list item", () => {
		// Arrange

		const html = "<ul><li><div>first</div><div>second</div></li></ul>";

		// Act

		const actual = divsToParagraphs(html);

		// Assert

		expect(actual).toBe("<ul><li>first<br>second</li></ul>");
	});

	it("Should drop empty scaffolding but keep a blank line when a card has both", () => {
		// Arrange

		const html =
			'<div id="js-rendered"></div><div><br></div><div>text</div>';

		// Act

		const actual = divsToParagraphs(html);

		// Assert

		expect(actual).toBe("<p><br></p><p>text</p>");
	});

	it("Should drop line breaks and emptied links between blocks when nothing is left in them", () => {
		// Arrange

		const html =
			'<a href="x"></a>\n<br><div>question</div><br>\n<div>answer</div>';

		// Act

		const actual = divsToParagraphs(html);

		// Assert

		expect(actual).toBe("<p>question</p><p>answer</p>");
	});
});
