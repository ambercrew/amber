import {
	htmlToLexicalJson,
	lexicalJsonsToHtml,
	markdownToLexicalJson,
	SerializedLexicalNodeTree,
} from "../../../components/Editor/lexicalJsonConversion";
import { sanitizeHtml } from "../../../utils/sanitizeHtml";
import { createEquationElement } from "../../../components/Editor/plugins/EquationPlugin/equationElement";

function equationsIn(json: string) {
	const found: { equation: unknown; display: unknown }[] = [];
	const visit = (node: SerializedLexicalNodeTree) => {
		if (node.type === "equation")
			found.push({ equation: node.equation, display: node.display });
		node.children?.forEach(visit);
	};
	visit((JSON.parse(json) as { root: SerializedLexicalNodeTree }).root);
	return found;
}

function clozesIn(json: string) {
	const found: { hiddenText: unknown; text: unknown }[] = [];
	const visit = (node: SerializedLexicalNodeTree) => {
		if (node.type === "cloze-hidden")
			found.push({ hiddenText: node.hiddenText, text: node.text });
		node.children?.forEach(visit);
	};
	visit((JSON.parse(json) as { root: SerializedLexicalNodeTree }).root);
	return found;
}

// Lexical's TextNode format bits.
const IS_SUBSCRIPT = 1 << 5;
const IS_SUPERSCRIPT = 1 << 6;

function textFormatsIn(json: string) {
	const found: { text: unknown; format: unknown }[] = [];
	const visit = (node: SerializedLexicalNodeTree) => {
		if (node.type === "text")
			found.push({ text: node.text, format: node.format });
		node.children?.forEach(visit);
	};
	visit((JSON.parse(json) as { root: SerializedLexicalNodeTree }).root);
	return found;
}

describe("lexicalJsonConversion", () => {
	it("Should format text as superscript and subscript when given sup and sub elements", () => {
		// Arrange

		const html = sanitizeHtml("<p>x<sup>2</sup> H<sub>2</sub>O</p>");

		// Act

		const actual = htmlToLexicalJson(html);

		// Assert

		expect(textFormatsIn(actual)).toEqual([
			{ text: "x", format: 0 },
			{ text: "2", format: IS_SUPERSCRIPT },
			{ text: " H", format: 0 },
			{ text: "2", format: IS_SUBSCRIPT },
			{ text: "O", format: 0 },
		]);
	});

	it("Should create a display equation node when given a display equation element", () => {
		// Arrange

		const html = `<p>${createEquationElement(document, "\\sum_i α_i", true).outerHTML}</p>`;

		// Act

		const actual = htmlToLexicalJson(html);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "\\sum_i α_i", display: true },
		]);
	});

	it("Should leave $…$ as text when given inline code", () => {
		// Arrange

		const html =
			"<p><code>echo $PATH:$HOME</code> and <code>\\(\\d+\\)</code></p>";

		// Act

		const actual = htmlToLexicalJson(html);

		// Assert

		expect(equationsIn(actual)).toEqual([]);
	});

	it("Should create equation nodes when given markdown with inline and display math", () => {
		// Arrange

		const markdown = "Let $x_1$ be\n\n$$\nx_1 = \\frac{1}{2}\n$$";

		// Act

		const actual = markdownToLexicalJson(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([
			{ equation: "x_1", display: false },
			{ equation: "x_1 = \\frac{1}{2}", display: true },
		]);
	});

	it("Should create an empty equation node when given malformed base64", () => {
		// Arrange

		const html = '<p><span data-lexical-equation="not base64!"></span></p>';

		// Act

		const actual = htmlToLexicalJson(html);

		// Assert

		expect(equationsIn(actual)).toEqual([{ equation: "", display: false }]);
	});

	it("Should leave $…$ as text when given html", () => {
		// Arrange

		const html = "<p>Area is $\\pi r^2$ and \\(x\\) here</p>";

		// Act

		const actual = htmlToLexicalJson(html);

		// Assert

		expect(equationsIn(actual)).toEqual([]);
	});

	it("Should leave $…$ as text when given markdown with escaped dollars", () => {
		// Arrange

		const markdown = "Price \\$x\\$ here";

		// Act

		const actual = markdownToLexicalJson(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([]);
	});

	it("Should leave $…$ as text when given a markdown code block", () => {
		// Arrange

		const markdown = "```bash\necho $PATH:$HOME\n```";

		// Act

		const actual = markdownToLexicalJson(markdown);

		// Assert

		expect(equationsIn(actual)).toEqual([]);
	});

	it("Should create a cloze node when given markdown with a cloze mark", () => {
		// Arrange

		const markdown =
			'<mark data-cloze-hidden="Paris &amp; &quot;Lutetia&quot;">[...]</mark> is the capital of **France**.';

		// Act

		const actual = markdownToLexicalJson(markdown);

		// Assert

		expect(clozesIn(actual)).toEqual([
			{ hiddenText: 'Paris & "Lutetia"', text: "[...]" },
		]);
	});

	it("Should render equations as MathJax delimiters when converting Lexical JSON to HTML", () => {
		// Arrange

		const json = markdownToLexicalJson(
			"Energy $E=mc^2$ and\n\n$$a^2+b^2$$",
		);

		// Act

		const [actual] = lexicalJsonsToHtml([json]);

		// Assert

		expect(actual).toContain("<span>\\(E=mc^2\\)</span>");
		expect(actual).toContain("\\[a^2+b^2\\]");
		expect(actual).not.toContain("katex");
	});

	it("Should keep asset image sources when converting Lexical JSON to HTML", () => {
		// Arrange

		const src = `amber-asset:${"a".repeat(64)}`;
		const json = htmlToLexicalJson(
			sanitizeHtml(`<p><img src="${src}"></p>`),
		);

		// Act

		const [actual] = lexicalJsonsToHtml([json]);

		// Assert

		expect(actual).toContain(`src="${src}"`);
	});

	it("Should return no HTML when the Lexical JSON is empty", () => {
		// Arrange

		const json = "";

		// Act

		const [actual] = lexicalJsonsToHtml([json]);

		// Assert

		expect(actual).toBe("");
	});

	it("Should render each document on its own when converting several", () => {
		// Arrange

		const jsons = ["First", "", "Second"].map(text =>
			text ? markdownToLexicalJson(text) : text,
		);

		// Act

		const [first, empty, second] = lexicalJsonsToHtml(jsons);

		// Assert

		expect(first).toContain("First");
		expect(first).not.toContain("Second");
		expect(empty).toBe("");
		expect(second).toContain("Second");
		expect(second).not.toContain("First");
	});

	it("Should leave code unhighlighted when converting Lexical JSON to HTML", () => {
		// Arrange

		const json = markdownToLexicalJson("```js\nconst a = 1;\n```");

		// Act

		const [first] = lexicalJsonsToHtml([json]);
		const [second] = lexicalJsonsToHtml([json]);

		// Assert

		expect(first).toContain("const a = 1;");
		expect(second).toBe(first);
	});
});
