import { markdownToHtml } from "../../utils/markdownToHtml";
import {
	decodeEquation,
	EQUATION_ATTRIBUTE_NAME,
	EQUATION_DISPLAY_ATTRIBUTE_NAME,
} from "../../components/Editor/plugins/EquationPlugin/equationElement";

function equationsIn(html: string) {
	const doc = new DOMParser().parseFromString(html, "text/html");
	return Array.from(
		doc.querySelectorAll(`[${EQUATION_ATTRIBUTE_NAME}]`),
		element => ({
			equation: decodeEquation(
				element.getAttribute(EQUATION_ATTRIBUTE_NAME) ?? "",
			),
			display: element.hasAttribute(EQUATION_DISPLAY_ATTRIBUTE_NAME),
		}),
	);
}

describe("markdownToHtml", () => {
	it("Should render inline equations without mangling their content when given $…$", () => {
		// Arrange

		const markdown = "Energy $a_1 * b_1 = c^*_2$ is conserved.";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "a_1 * b_1 = c^*_2", display: false },
		]);
		expect(actual).not.toContain("<em>");
	});

	it("Should keep dollar amounts as text when given prices", () => {
		// Arrange

		const markdown = "It costs $5 and $10 more, or $5–$10 in total.";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([]);
		expect(actual).toContain("$5 and $10");
	});

	it("Should render a display equation keeping double backslashes when given a multi-line $$ block", () => {
		// Arrange

		const markdown = "Before\n\n$$\n\\frac{a}{b} \\\\ x\n$$\n\nAfter";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "\\frac{a}{b} \\\\ x", display: true },
		]);
		expect(actual).toContain("<p>After</p>");
	});

	it("Should render equations when given \\( \\) and \\[ \\] delimiters", () => {
		// Arrange

		const markdown = "Inline \\(x^2\\) here.\n\n\\[ y = mx + b \\]";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "x^2", display: false },
			{ equation: "y = mx + b", display: true },
		]);
	});

	it("Should render the whole environment as a display equation when given \\begin{align}", () => {
		// Arrange

		const markdown = "\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{
				equation: "\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}",
				display: true,
			},
		]);
	});

	it("Should keep escaped dollars as text when given \\$", () => {
		// Arrange

		const markdown = "Price \\$x\\$ here";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([]);
		expect(actual).toContain("$x$");
	});

	it("Should render two separate equations when given two $$ equations on one line", () => {
		// Arrange

		const markdown = "$$a$$ and $$b$$";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "a", display: true },
			{ equation: "b", display: true },
		]);
		expect(actual).toContain(" and ");
	});

	it("Should keep a nested environment whole when given split inside equation", () => {
		// Arrange

		const markdown =
			"\\begin{equation}\n\\begin{split}\na &= b\n\\end{split}\n\\end{equation}";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{
				equation:
					"\\begin{equation}\n\\begin{split}\na &= b\n\\end{split}\n\\end{equation}",
				display: true,
			},
		]);
	});

	it("Should keep escaped brackets as text when given inline \\[1\\]", () => {
		// Arrange

		const markdown = "see \\[1\\] and \\[2\\]";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([]);
		expect(actual).toContain("see [1] and [2]");
	});

	it("Should render a display equation when given a ```math fence", () => {
		// Arrange

		const markdown = "Before\n\n```math\n\\frac{a}{b}\n```\n\nAfter";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "\\frac{a}{b}", display: true },
		]);
		expect(actual).not.toContain("<code");
	});

	it("Should render a display equation when given a ~~~math fence", () => {
		// Arrange

		const markdown = "~~~math\nx^2\n~~~";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "x^2", display: true },
		]);
	});

	it("Should render an inline equation when given GitHub's $`…`$ form", () => {
		// Arrange

		const markdown = "Area is $`\\pi r^2`$ here.";

		// Act

		const actual = markdownToHtml(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "\\pi r^2", display: false },
		]);
		expect(actual).not.toContain("<code");
	});
});
