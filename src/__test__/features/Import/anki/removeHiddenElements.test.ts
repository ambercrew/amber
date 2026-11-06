import { removeHiddenElements } from "../../../../features/Import/anki/removeHiddenElements";

describe("removeHiddenElements", () => {
	it("Should drop hidden data, images, repeated text, controls and scripts when a card has them", () => {
		// Arrange

		const html =
			'<p>Title</p><span hidden="">Title</span><p>question <mark data-cloze-hidden="x">[...]</mark></p>' +
			'<div hidden="">{"record":"<p>data</p>"}</div>' +
			'<img style="display: none" src="mug.png"><button>Show</button><script>render()</script>';

		// Act

		const actual = removeHiddenElements(html);

		// Assert

		expect(actual).toBe(
			'<p>Title</p><p>question <mark data-cloze-hidden="x">[...]</mark></p>',
		);
	});

	it("Should keep a hidden answer when the rest of the card is visible", () => {
		// Arrange

		const html =
			'<div id="cloze-is-back" hidden="">any number</div><p>For example</p>';

		// Act

		const actual = removeHiddenElements(html);

		// Assert

		expect(actual).toBe(html);
	});

	it("Should keep hidden content but drop cloze source and data when a scripted template hides the whole card", () => {
		// Arrange

		const html =
			'<div hidden="">{{c1::source}}</div>' +
			'<div id="rendered" hidden="">front <mark data-cloze-hidden="x">[...]</mark></div>' +
			'<div hidden="">{"subjects":[1]}</div>' +
			'<div id="js-rendered"></div><script>reveal()</script>';

		// Act

		const actual = removeHiddenElements(html);

		// Assert

		expect(actual).toBe(
			'<div id="rendered" hidden="">front <mark data-cloze-hidden="x">[...]</mark></div><div id="js-rendered"></div>',
		);
	});

	it("Should drop a collapsed details only when it folds away script data", () => {
		// Arrange

		const html =
			'<p>answer</p><details><summary>Record</summary><pre>{"id":1}</pre></details>' +
			"<details><summary>More</summary><p>notes</p></details>";

		// Act

		const actual = removeHiddenElements(html);

		// Assert

		expect(actual).toBe(
			"<p>answer</p><details><summary>More</summary><p>notes</p></details>",
		);
	});
});
