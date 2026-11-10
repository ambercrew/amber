import { applyCardStyles } from "../../../../features/Import/anki/applyCardStyles";
import { editHtml } from "./editHtml";

describe("applyCardStyles", () => {
	it("Should mark the highlighted part and space boxed words when the note type CSS styles them", () => {
		// Arrange

		const html =
			"<style>.m { font-weight: 700; text-decoration: underline } span.w { display: inline-block }</style>" +
			'<span class="w"><span class="m">sub</span>marine</span><span class="w">submerge</span>';

		// Act

		const actual = editHtml(html, applyCardStyles);

		// Assert

		expect(actual).toContain(
			'<span class="w"><span class="m"><u><b>sub</b></u></span>marine</span> <span class="w">submerge</span>',
		);
	});

	it("Should hide elements and make lines when the CSS hides them or shows a span as a block", () => {
		// Arrange

		const html =
			"<style>.hint { display: none } .line { display: block } .x { font-style: italic }</style>" +
			'<span class="hint">answer</span><span class="line">one</span><span class="line">two</span>';

		// Act

		const actual = editHtml(html, applyCardStyles);

		// Assert

		expect(actual).toContain(
			'<span class="hint" hidden="">answer</span><div>one</div><div>two</div>',
		);
	});

	it("Should ignore night mode, the card wrapper, media queries and later overrides when they apply", () => {
		// Arrange

		const html =
			"<style>.card { font-weight: bold } .nightMode .q { font-weight: bold } " +
			"@media (max-width: 600px) { .q { font-style: italic } } .q { font-weight: bold } .q { font-weight: normal }</style>" +
			'<div class="card"><span class="q">plain</span></div>';

		// Act

		const actual = editHtml(html, applyCardStyles);

		// Assert

		expect(actual).toContain(
			'<div class="card"><span class="q">plain</span></div>',
		);
	});

	it("Should leave the html unchanged when it has no style", () => {
		// Arrange

		const html = '<span class="m">sub</span>';

		// Act

		const actual = editHtml(html, applyCardStyles);

		// Assert

		expect(actual).toBe(html);
	});
});
