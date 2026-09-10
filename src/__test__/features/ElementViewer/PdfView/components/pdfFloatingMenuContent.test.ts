import {
	buildClozeCardDto,
	buildExtractDto,
	clozeFrontToHtml,
	selectedTextToHtml,
} from "../../../../../features/ElementViewer/PdfView/components/pdfFloatingMenuContent";
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
	it("Should hide the selected text within the full page text", () => {
		// Arrange

		const pageTexts = ["Before Selected After"];
		const selectedTexts = ["Selected"];

		// Act

		const html = clozeFrontToHtml(pageTexts, selectedTexts);

		// Assert

		expect(html).toBe(
			'<p>Before <mark data-cloze-hidden="Selected">[...]</mark> After</p>',
		);
	});

	it("Should fall back to plain, un-hidden text when the selected text isn't found on the page", () => {
		// Arrange

		const pageTexts = ["Some page content"];
		const selectedTexts = ["Not on this page"];

		// Act

		const html = clozeFrontToHtml(pageTexts, selectedTexts);

		// Assert

		expect(html).toBe("<p>Some page content</p>");
	});

	it("Should build one paragraph per page for a multi-page selection", () => {
		// Arrange

		const pageTexts = [
			"Page one Selected1 text",
			"Page two Selected2 text",
		];
		const selectedTexts = ["Selected1", "Selected2"];

		// Act

		const html = clozeFrontToHtml(pageTexts, selectedTexts);

		// Assert

		expect(html).toMatch(/^<p>.*<\/p><p>.*<\/p>$/);
		expect(html).toContain('data-cloze-hidden="Selected1"');
		expect(html).toContain('data-cloze-hidden="Selected2"');
	});

	it("Should escape HTML-significant characters surrounding the hidden text", () => {
		// Arrange

		const pageTexts = ["<b>Before</b> Selected & after"];
		const selectedTexts = ["Selected"];

		// Act

		const html = clozeFrontToHtml(pageTexts, selectedTexts);

		// Assert

		expect(html).toContain("&lt;b&gt;Before&lt;/b&gt;");
		expect(html).toContain("&amp; after");
	});

	it("Should hide the occurrence at the given offset rather than the first match when the selected text repeats on the page", () => {
		// Arrange

		const pageTexts = ["Selected first, Selected second"];
		const selectedTexts = ["Selected"];
		const selectionSlices = [{ start: 16, count: 8 }];

		// Act

		const html = clozeFrontToHtml(
			pageTexts,
			selectedTexts,
			selectionSlices,
		);

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
			name: "Selected phrase",
			parent: PARENT,
			origin: { type: "inherited" },
		});
		expect(collectText(parseRoot(dto!.content))).toBe("Selected phrase");
	});

	it("Should truncate a long selection's name to 50 characters", () => {
		// Arrange

		const longText = "A".repeat(60);

		// Act

		const dto = buildExtractDto([longText], PARENT);

		// Assert

		expect(dto!.meta.name).toBe("A".repeat(50));
	});
});

describe("buildClozeCardDto", () => {
	it("Should return null when the selected text is blank", () => {
		// Arrange

		const pageTexts = ["Some full page text"];
		const selectedTexts = [""];

		// Act

		const dto = buildClozeCardDto(pageTexts, selectedTexts, PARENT);

		// Assert

		expect(dto).toBeNull();
	});

	it("Should build a card dto with a hidden front and a plain-text back", () => {
		// Arrange

		const pageTexts = ["Before Selected After"];
		const selectedTexts = ["Selected"];

		// Act

		const dto = buildClozeCardDto(pageTexts, selectedTexts, PARENT);

		// Assert

		expect(dto).not.toBeNull();
		expect(dto!.meta).toEqual({
			name: "Selected",
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

	it("Should name the card from the selected text joined across pages", () => {
		// Arrange

		const pageTexts = ["Page one Selected1", "Page two Selected2"];
		const selectedTexts = ["Selected1", "Selected2"];

		// Act

		const dto = buildClozeCardDto(pageTexts, selectedTexts, PARENT);

		// Assert

		expect(dto!.meta.name).toBe("Selected1 Selected2");
	});
});
