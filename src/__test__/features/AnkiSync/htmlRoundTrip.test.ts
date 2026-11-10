import {
	htmlToLexicalJson,
	lexicalJsonsToHtml,
} from "../../../components/Editor/lexicalJsonConversion";
import { convertImportedHtml } from "../../../features/Import/convertImportedHtml";

/** The HTML Amber sends Anki for a card written as `html`. */
function rendered(html: string): string {
	return lexicalJsonsToHtml([htmlToLexicalJson(html)])[0];
}

/** What the backend's `convert_math` (tested in `math.rs`) makes of MathJax before an edit gets here. */
function convertMath(html: string): string {
	return html
		.replace(/\\\((.*?)\\\)/g, (_, tex: string) => equation(tex))
		.replace(/\\\[(.*?)\\\]/g, (_, tex: string) => equation(tex, true));
}

/** Amber's HTML for a side Anki sent back as an edit, read the way the sync reads it. */
async function roundTripped(html: string): Promise<string> {
	const response = await convertImportedHtml({
		requestId: "1",
		htmls: [convertMath(html)],
	});
	if ("error" in response) throw new Error(response.error);
	return lexicalJsonsToHtml(response.contents)[0];
}

/** Base64 of `tex`, as the backend's `convert_math` writes an equation. */
function equation(tex: string, display = false): string {
	const shown = display ? ' data-lexical-equation-display="true"' : "";
	return `<span data-lexical-equation="${btoa(tex)}"${shown}></span>`;
}

// A side that changes on the way back would look edited on every sync, sending it to and fro.
describe("Anki sync HTML round trip", () => {
	it.each([
		[
			"formatted text",
			"<p>To <b>speak</b>, <i>hablar</i>, <u>sprechen</u></p>",
		],
		["several paragraphs", "<p>First</p><p>Second</p>"],
		["a bulleted list", "<ul><li>one</li><li>two</li></ul>"],
		["a numbered list", "<ol><li>one</li><li>two</li></ol>"],
		["headings", "<h1>Title</h1><h2>Section</h2><p>Text</p>"],
		["a quote", "<blockquote>Veni, vidi, vici</blockquote>"],
		["code", "<pre><code>let x = 1;</code></pre>"],
		["inline code", "<p>Call <code>f(x)</code></p>"],
		[
			"equations",
			`<p>inline ${equation("x^2")} and ${equation("\\int_0^1 f", true)}</p>`,
		],
	])(
		"Should give back the HTML Amber sent when Anki returns a side with %s unchanged",
		async (_, html) => {
			// Arrange

			const sent = rendered(html);

			// Act

			const actual = await roundTripped(sent);

			// Assert

			expect(actual).toBe(sent);
		},
	);
});
