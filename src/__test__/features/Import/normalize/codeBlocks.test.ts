import { prepareCodeBlocks } from "../../../../features/Import/normalize/codeBlocks";

function languageAfterSetting(html: string) {
	const doc = new DOMParser().parseFromString(html, "text/html");
	prepareCodeBlocks(doc);
	return doc.querySelector("pre")?.getAttribute("data-language");
}

describe("prepareCodeBlocks", () => {
	it.each([
		[
			"Defuddle's code class",
			'<pre><code class="language-python">x</code></pre>',
			"python",
		],
		[
			"a data-lang alias",
			'<pre><code data-lang="py">x</code></pre>',
			"python",
		],
		["a lang- class on the pre", '<pre class="lang-rust">x</pre>', "rust"],
		[
			"Pandoc's bare class",
			'<pre class="sourceCode haskell">x</pre>',
			"haskell",
		],
		[
			"GitHub's wrapper",
			'<div class="highlight highlight-source-go"><pre>x</pre></div>',
			"go",
		],
		[
			"Rouge's wrappers",
			'<div class="language-ruby highlighter-rouge"><div class="highlight"><pre class="highlight"><code>x</code></pre></div></div>',
			"ruby",
		],
		[
			"Wikipedia's wrapper",
			'<div class="mw-highlight mw-highlight-lang-zig"><pre>x</pre></div>',
			"zig",
		],
		[
			"a plain text class",
			'<pre><code class="language-text">x</code></pre>',
			"plaintext",
		],
	])("Should set the language when the block has %s", (_, html, expected) => {
		// Arrange & Act

		const actual = languageAfterSetting(html);

		// Assert

		expect(actual).toBe(expected);
	});

	it("Should set plain text when the block names no known language", () => {
		// Arrange & Act

		const actual = languageAfterSetting(
			'<pre class="highlight"><code class="language-foo">x</code></pre>',
		);

		// Assert

		expect(actual).toBe("plaintext");
	});

	it("Should unwrap the code element when the block has one", () => {
		// Arrange

		const doc = new DOMParser().parseFromString(
			'<pre><code class="language-go"><span>x</span></code></pre>',
			"text/html",
		);

		// Act

		prepareCodeBlocks(doc);

		// Assert

		expect(doc.body.innerHTML).toBe(
			'<pre data-language="go"><span>x</span></pre>',
		);
	});

	it("Should ignore bare classes when they're on a wrapper", () => {
		// Arrange & Act

		const actual = languageAfterSetting(
			'<div class="go"><pre>x</pre></div>',
		);

		// Assert

		expect(actual).toBe("plaintext");
	});
});
