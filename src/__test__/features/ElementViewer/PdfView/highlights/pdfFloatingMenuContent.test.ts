import {
	buildClozeCardDto,
	buildExtractDto,
	clozeFrontToHtml,
	selectedTextToHtml,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfFloatingMenuContent";
import { type SerializedLexicalNodeTree } from "../../../../../components/Editor/lexicalJsonConversion";
import { ElementId } from "../../../../../types/elements/elementId";
import { escapeHtml } from "../../../../../utils/escapeHtml";

const PARENT: ElementId = { type: "learningAsset", id: "learningAsset-1" };

function parseRoot(json: string): SerializedLexicalNodeTree {
	return (JSON.parse(json) as { root: SerializedLexicalNodeTree }).root;
}
function collectText(node: SerializedLexicalNodeTree): string {
	if (typeof node.text === "string") return node.text;
	return (node.children ?? []).map(collectText).join("");
}
function collectByType(
	node: SerializedLexicalNodeTree,
	type: string,
	out: SerializedLexicalNodeTree[] = [],
): SerializedLexicalNodeTree[] {
	if (node.type === type) out.push(node);
	(node.children ?? []).forEach(child => collectByType(child, type, out));
	return out;
}

describe("escapeHtml", () => {
	it("Should escape HTML-significant characters when given raw text", () => {
		// Arrange

		const text = `<script>alert("hi") & 'bye'</script>`;

		// Act

		const actual = escapeHtml(text);

		// Assert

		expect(actual).not.toContain("<script>");
		expect(actual).toContain("&lt;script&gt;");
		expect(actual).toContain("&amp;");
	});

	it("Should escape quotes when given text destined for an attribute value", () => {
		// Arrange

		const text = `he called it "cloze" 'twice'`;

		// Act

		const actual = escapeHtml(text);

		// Assert

		expect(actual).toBe("he called it &quot;cloze&quot; &#39;twice&#39;");
	});
});

describe("selectedTextToHtml", () => {
	it("Should wrap each non-blank page in its own paragraph", () => {
		// Arrange

		const pages = ["First page text", "Second page text"];

		// Act

		const html = selectedTextToHtml(pages);

		// Assert

		expect(html).toBe("<p>First page text</p><p>Second page text</p>");
	});

	it("Should drop blank or whitespace-only pages", () => {
		// Arrange

		const pages = ["Some text", "   ", ""];

		// Act

		const html = selectedTextToHtml(pages);

		// Assert

		expect(html).toBe("<p>Some text</p>");
	});

	it("Should escape HTML-significant characters in the page text", () => {
		// Arrange

		const pages = ["<b>Bold</b> & bold"];

		// Act

		const html = selectedTextToHtml(pages);

		// Assert

		expect(html).toBe("<p>&lt;b&gt;Bold&lt;/b&gt; &amp; bold</p>");
	});
});

describe("clozeFrontToHtml", () => {
	it("Should hide the selected part of the page text", () => {
		// Arrange

		const pages = [
			{ before: "Before ", hidden: "Selected", after: " After" },
		];

		// Act

		const html = clozeFrontToHtml(pages);

		// Assert

		expect(html).toBe(
			'<p>Before <mark data-cloze-hidden="Selected">[...]</mark> After</p>',
		);
	});

	it("Should show the page's plain text when nothing on it is selected", () => {
		// Arrange

		const pages = [{ before: "Some page ", hidden: " ", after: "content" }];

		// Act

		const html = clozeFrontToHtml(pages);

		// Assert

		expect(html).toBe("<p>Some page  content</p>");
	});

	it("Should build one paragraph per page for a multi-page selection", () => {
		// Arrange

		const pages = [
			{ before: "Page one ", hidden: "Selected1", after: "" },
			{ before: "", hidden: "Selected2", after: " text" },
		];

		// Act

		const html = clozeFrontToHtml(pages);

		// Assert

		expect(html).toMatch(/^<p>.*<\/p><p>.*<\/p>$/);
		expect(html).toContain('data-cloze-hidden="Selected1"');
		expect(html).toContain('data-cloze-hidden="Selected2"');
	});

	it("Should escape HTML-significant characters surrounding the hidden text", () => {
		// Arrange

		const pages = [
			{ before: "<b>Before</b> ", hidden: "Selected", after: " & after" },
		];

		// Act

		const html = clozeFrontToHtml(pages);

		// Assert

		expect(html).toContain("&lt;b&gt;Before&lt;/b&gt;");
		expect(html).toContain("&amp; after");
	});

	it("Should escape quotes in the hidden text so they can't terminate the attribute", () => {
		// Arrange

		const pages = [
			{ before: "Before ", hidden: `"quoted"`, after: " after" },
		];

		// Act

		const html = clozeFrontToHtml(pages);

		// Assert

		expect(html).toBe(
			'<p>Before <mark data-cloze-hidden="&quot;quoted&quot;">[...]</mark> after</p>',
		);
	});

	it("Should hide the selected occurrence rather than the first when the selected text repeats on the page", () => {
		// Arrange

		const pages = [
			{
				before: "Selected first, ",
				hidden: "Selected",
				after: " second",
			},
		];

		// Act

		const html = clozeFrontToHtml(pages);

		// Assert

		expect(html).toBe(
			'<p>Selected first, <mark data-cloze-hidden="Selected">[...]</mark> second</p>',
		);
	});
});

describe("buildExtractDto", () => {
	it("Should return null when every page's selected text is blank", () => {
		// Arrange

		const pages = ["", "   "];

		// Act

		const dto = buildExtractDto(pages, PARENT);

		// Assert

		expect(dto).toBeNull();
	});

	it("Should build an extract dto naming, parenting and containing the selected text", () => {
		// Arrange

		const pages = ["Selected phrase"];

		// Act

		const dto = buildExtractDto(pages, PARENT);

		// Assert

		expect(dto).not.toBeNull();
		expect(dto!.meta).toEqual({
			name: null,
			parent: PARENT,
			origin: { type: "inherited" },
		});
		expect(collectText(parseRoot(dto!.content))).toBe("Selected phrase");
	});
});

describe("buildClozeCardDto", () => {
	it("Should return null when the selected text is blank", () => {
		// Arrange

		const pages = [
			{ before: "Some full ", hidden: "", after: "page text" },
		];

		// Act

		const dto = buildClozeCardDto(pages, PARENT);

		// Assert

		expect(dto).toBeNull();
	});

	it("Should build a card dto with a hidden front and a plain-text back", () => {
		// Arrange

		const pages = [
			{ before: "Before ", hidden: "Selected", after: " After" },
		];

		// Act

		const dto = buildClozeCardDto(pages, PARENT);

		// Assert

		expect(dto).not.toBeNull();
		expect(dto!.meta).toEqual({
			name: null,
			parent: PARENT,
			origin: { type: "inherited" },
		});

		const frontRoot = parseRoot(dto!.front);
		expect(collectText(frontRoot)).toBe("Before [...] After");
		const clozes = collectByType(frontRoot, "cloze-hidden");
		expect(clozes).toHaveLength(1);
		expect(clozes[0].hiddenText).toBe("Selected");

		expect(collectText(parseRoot(dto!.back))).toBe("Selected");
	});

	it("Should keep the hidden text intact when the selection contains a double quote", () => {
		// Arrange

		const pages = [
			{ before: "Before ", hidden: `"quoted phrase"`, after: " after" },
		];

		// Act

		const dto = buildClozeCardDto(pages, PARENT);

		// Assert

		const clozes = collectByType(parseRoot(dto!.front), "cloze-hidden");
		expect(clozes[0].hiddenText).toBe(`"quoted phrase"`);
	});
});
