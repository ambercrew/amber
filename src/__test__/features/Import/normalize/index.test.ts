import { normalize } from "../../../../features/Import/normalize";
import { htmlToLexicalJson } from "../../../../components/Editor/lexicalJsonConversion";
import {
	localizeImages,
	LocalizedImage,
} from "../../../../features/Import/images/localize";

vi.mock(import("../../../../features/Import/images/localize"));

interface SerializedNode {
	type: string;
	language?: string;
	children?: SerializedNode[];
}

function codeLanguages(node: SerializedNode): (string | undefined)[] {
	const own = node.type === "code" ? [node.language] : [];
	return [...own, ...(node.children ?? []).flatMap(codeLanguages)];
}

function localizeEveryImageAs(localized: LocalizedImage) {
	vi.mocked(localizeImages).mockImplementation(async urls =>
		Promise.resolve(new Map(urls.map(url => [url, localized]))),
	);
}

describe("normalize", () => {
	beforeEach(() => {
		localizeEveryImageAs({ ok: false, originalUrl: "unused" });
	});

	it("Should sanitize the html and return the body's innerHTML", async () => {
		// Arrange

		// Act

		const actual = await normalize("<script>bad()</script><p>kept</p>", {
			baseUrl: null,
		});

		// Assert

		expect(actual).toBe("<p>kept</p>");
	});

	it("Should keep the code block's language through sanitizing when its code names one", async () => {
		// Arrange

		const html =
			'<div class="highlight-source-python"><pre><code>x = 1</code></pre></div>';

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(actual).toBe('<pre data-language="python">x = 1</pre>');
	});

	it("Should make one code block with the language when the code spans lines", async () => {
		// Arrange

		const html =
			'<pre><code class="language-rust">let a = 1;\nlet b = 2;</code></pre>';

		// Act

		const json = htmlToLexicalJson(
			await normalize(html, { baseUrl: null }),
		);

		// Assert

		expect(
			codeLanguages((JSON.parse(json) as { root: SerializedNode }).root),
		).toEqual(["rust"]);
	});

	it("Should keep math as an equation element through sanitizing when given MathML", async () => {
		// Arrange

		const html =
			'<p>See <math display="block" data-latex="E = mc^2"><mi>E</mi></math></p>';

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(actual).toBe(
			`<p>See <span data-lexical-equation="${btoa("E = mc^2")}" data-lexical-equation-display="true"></span></p>`,
		);
	});

	it("Should replace an image src with the localized src when localization succeeds", async () => {
		// Arrange

		localizeEveryImageAs({
			ok: true,
			src: "data:image/png;base64,AAAA",
		});
		const html = '<img src="https://example.com/a.png">';

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(actual).toBe('<img src="data:image/png;base64,AAAA">');
	});

	it("Should mark the image as broken and keep the original url when localization fails", async () => {
		// Arrange

		localizeEveryImageAs({
			ok: false,
			originalUrl: "https://example.com/a.png",
		});
		const html = '<img src="https://example.com/a.png">';

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(actual).toBe(
			'<img src="https://example.com/a.png" data-broken-asset="true">',
		);
	});

	it("Should resolve a relative image url against the baseUrl before localizing", async () => {
		// Arrange

		localizeEveryImageAs({
			ok: true,
			src: "data:image/png;base64,AAAA",
		});
		const html = '<img src="/images/a.png">';

		// Act

		await normalize(html, { baseUrl: "https://example.com/article" });

		// Assert

		expect(localizeImages).toHaveBeenCalledWith(
			["https://example.com/images/a.png"],
			"https://example.com/article",
		);
	});

	it("Should remove the src when the image url cannot be resolved and there is no baseUrl", async () => {
		// Arrange

		const html = '<img src="/images/a.png">';

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(actual).toBe("<img>");
		expect(localizeImages).toHaveBeenCalledWith([], null);
	});

	it("Should only localize each unique image url once", async () => {
		// Arrange

		localizeEveryImageAs({
			ok: true,
			src: "data:image/png;base64,AAAA",
		});
		const html =
			'<img src="https://example.com/a.png"><img src="https://example.com/a.png">';

		// Act

		await normalize(html, { baseUrl: null });

		// Assert

		expect(localizeImages).toHaveBeenCalledWith(
			["https://example.com/a.png"],
			null,
		);
	});

	it("Should localize a data uri src using the uri itself as the absolute url", async () => {
		// Arrange

		localizeEveryImageAs({
			ok: true,
			src: "data:image/png;base64,AAAA",
		});
		const html = '<img src="data:image/png;base64,AAAA">';

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(localizeImages).toHaveBeenCalledWith(
			["data:image/png;base64,AAAA"],
			null,
		);
		expect(actual).toBe('<img src="data:image/png;base64,AAAA">');
	});

	it("Should keep the src without localizing it when it is a stored asset src", async () => {
		// Arrange

		const src = `amber-asset:${"a".repeat(64)}`;
		const html = `<img src="${src}">`;

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(localizeImages).toHaveBeenCalledWith([], null);
		expect(actual).toBe(`<img src="${src}">`);
	});

	it("Should resolve a relative link href against the baseUrl", async () => {
		// Arrange

		const html = '<a href="/wiki/Foo">Foo</a>';

		// Act

		const actual = await normalize(html, {
			baseUrl: "https://example.com/article",
		});

		// Assert

		expect(actual).toBe('<a href="https://example.com/wiki/Foo">Foo</a>');
	});

	it("Should keep an already-absolute link href unchanged", async () => {
		// Arrange

		const html = '<a href="https://other.com/page">Page</a>';

		// Act

		const actual = await normalize(html, {
			baseUrl: "https://example.com/article",
		});

		// Assert

		expect(actual).toBe('<a href="https://other.com/page">Page</a>');
	});

	it("Should remove the href when a relative link url cannot be resolved and there is no baseUrl", async () => {
		// Arrange

		const html = '<a href="/wiki/Foo">Foo</a>';

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(actual).toBe("<a>Foo</a>");
	});
});
