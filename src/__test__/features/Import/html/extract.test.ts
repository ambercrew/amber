import { extractHtml } from "../../../../features/Import/html/extract";
import { prepareCodeBlocks } from "../../../../features/Import/normalize/codeBlocks";
import { convertMath } from "../../../../features/Import/normalize/convertMath";
import {
	decodeEquation,
	EQUATION_ATTRIBUTE_NAME,
	EQUATION_DISPLAY_ATTRIBUTE_NAME,
} from "../../../../components/Editor/plugins/EquationPlugin/equationElement";

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

	it("Should preserve Wikipedia Parsoid TeX and bare MathML when Defuddle extracts the article", () => {
		// Arrange

		const paragraph = "This is the article body. ".repeat(20);
		const dataMw = JSON.stringify({
			name: "math",
			attrs: {},
			body: {
				extsrc: "X_v \\perp X_{V \\smallsetminus \\operatorname{de}(v)} \\quad \\text{for all } v \\in V",
			},
		});
		const page = `<html><body><article><h1>Markov</h1><p>${paragraph}<math><msup><mi>x</mi><mn>2</mn></msup></math></p><dl><dd><math class="mwe-math-element mwe-math-element-inline" data-mw='${dataMw}'><mrow><msub><mi>X</mi><mi>v</mi></msub><mtext>for all </mtext><mi>v</mi></mrow></math></dd></dl></article></body></html>`;

		// Act

		const { html } = extractHtml(page);
		const doc = new DOMParser().parseFromString(html, "text/html");
		convertMath(doc);
		const equations = Array.from(
			doc.querySelectorAll(`[${EQUATION_ATTRIBUTE_NAME}]`),
			el => ({
				equation: decodeEquation(
					el.getAttribute(EQUATION_ATTRIBUTE_NAME) ?? "",
				),
				display: el.hasAttribute(EQUATION_DISPLAY_ATTRIBUTE_NAME),
			}),
		);

		// Assert

		expect(equations).toHaveLength(2);
		expect(equations[0].equation.replace(/\s/g, "")).toBe("x^{2}");
		expect(equations[0].display).toBe(false);
		expect(equations[1]).toEqual({
			equation:
				"X_v \\perp X_{V \\smallsetminus \\operatorname{de}(v)} \\quad \\text{for all } v \\in V",
			display: true,
		});
	});
});
