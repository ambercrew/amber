import { convertMath } from "../../../../features/Import/normalize/convertMath";
import {
	decodeEquation,
	EQUATION_ATTRIBUTE_NAME,
	EQUATION_DISPLAY_ATTRIBUTE_NAME,
} from "../../../../components/Editor/plugins/EquationPlugin/equationElement";

function convert(html: string) {
	const doc = new DOMParser().parseFromString(html, "text/html");
	convertMath(doc);
	return {
		text: doc.body.textContent,
		equations: Array.from(
			doc.querySelectorAll(`[${EQUATION_ATTRIBUTE_NAME}]`),
			element => ({
				equation: decodeEquation(
					element.getAttribute(EQUATION_ATTRIBUTE_NAME) ?? "",
				),
				display: element.hasAttribute(EQUATION_DISPLAY_ATTRIBUTE_NAME),
			}),
		),
	};
}

describe("convertMath", () => {
	it("Should use the data-latex attribute when given Defuddle's math output", () => {
		// Arrange

		const html =
			'<p>See <math display="block" data-latex="E = mc^2"><mi>E</mi></math></p>';

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toEqual([
			{ equation: "E = mc^2", display: true },
		]);
	});

	it("Should replace the whole KaTeX wrapper when given KaTeX-rendered html", () => {
		// Arrange

		const html =
			'<p>A <span class="katex"><span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x2</span></span> B</p>';

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toEqual([{ equation: "x^2", display: false }]);
		expect(actual.text).toBe("A  B");
	});

	it("Should ignore alttext and convert the MathML when given a placeholder alttext", () => {
		// Arrange

		const html =
			'<p><math alttext="Alternative text not available"><msup><mi>x</mi><mn>2</mn></msup></math></p>';

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toHaveLength(1);
		expect(actual.equations[0].equation.replace(/\s/g, "")).toBe("x^{2}");
	});

	it("Should unwrap displaystyle when given Wikipedia's math markup", () => {
		// Arrange

		const html =
			'<span class="mwe-math-element"><math alttext="{\\displaystyle a^{2}+b^{2}}"><semantics><mi>a</mi><annotation encoding="application/x-tex">{\\displaystyle a^{2}+b^{2}}</annotation></semantics></math><img alt="{\\displaystyle a^{2}+b^{2}}"></span>';

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toEqual([
			{ equation: "a^{2}+b^{2}", display: false },
		]);
	});

	it("Should convert the MathML to LaTeX when given bare EPUB MathML", () => {
		// Arrange

		const html =
			"<p><math><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></math></p>";

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toHaveLength(1);
		expect(actual.equations[0].equation.replace(/\s/g, "")).toBe("x^{2}+1");
		expect(actual.text).toBe("");
	});

	it("Should replace the script and its rendered output when given MathJax 2 markup", () => {
		// Arrange

		const html =
			'<span class="MathJax_Preview"></span><div class="MathJax_Display">rendered</div><script type="math/tex; mode=display">\\int f</script>';

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toEqual([
			{ equation: "\\int f", display: true },
		]);
		expect(actual.text).not.toContain("rendered");
	});

	it("Should convert once when given MathJax 2 markup with assistive MathML", () => {
		// Arrange

		const html =
			'<p>A <span class="MathJax_Preview"></span><span class="MathJax"><math><msup><mi>x</mi><mn>2</mn></msup></math></span><script type="math/tex">x^2</script> B</p>';

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toEqual([{ equation: "x^2", display: false }]);
		expect(actual.text).toBe("A  B");
	});

	it("Should convert once when given MathJax 2 CommonHTML markup", () => {
		// Arrange

		const html =
			'<p>A <span class="MathJax_Preview"></span><span class="mjx-chtml MathJax_CHTML"><span class="mjx-math">x2</span><span class="MJX_Assistive_MathML"><math><msup><mi>x</mi><mn>2</mn></msup></math></span></span><script type="math/tex">x^2</script> B</p>';

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toEqual([{ equation: "x^2", display: false }]);
		expect(actual.text).toBe("A  B");
	});

	it("Should keep the style commands when given several styled groups", () => {
		// Arrange

		const html =
			'<p><math><semantics><mi>a</mi><annotation encoding="application/x-tex">{\\textstyle a}+{\\textstyle b}</annotation></semantics></math></p>';

		// Act

		const actual = convert(html);

		// Assert

		expect(actual.equations).toEqual([
			{ equation: "{\\textstyle a}+{\\textstyle b}", display: false },
		]);
	});

	it("Should replace the outer wrapper as display math when given KaTeX display markup", () => {
		// Arrange

		const html =
			'<p><span class="katex-display"><span class="katex"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math></span></span></p>';

		// Act

		const doc = new DOMParser().parseFromString(html, "text/html");
		convertMath(doc);

		// Assert

		expect(doc.querySelector(".katex-display")).toBeNull();
		expect(
			doc
				.querySelector(`[${EQUATION_ATTRIBUTE_NAME}]`)
				?.hasAttribute(EQUATION_DISPLAY_ATTRIBUTE_NAME),
		).toBe(true);
	});
});
