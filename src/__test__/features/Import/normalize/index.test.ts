import { normalize } from "../../../../features/Import/normalize";
import { localizeImage } from "../../../../features/Import/images/localize";

vi.mock(import("../../../../features/Import/images/localize"));

describe("normalize", () => {
	it("Should sanitize the html and return the body's innerHTML", async () => {
		// Arrange

		vi.mocked(localizeImage).mockResolvedValue({
			ok: false,
			originalUrl: "unused",
		});

		// Act

		const actual = await normalize("<script>bad()</script><p>kept</p>", {
			baseUrl: null,
		});

		// Assert

		expect(actual).toBe("<p>kept</p>");
	});

	it("Should keep math as an equation element through sanitizing when given MathML", async () => {
		// Arrange

		vi.mocked(localizeImage).mockResolvedValue({
			ok: false,
			originalUrl: "unused",
		});
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

		vi.mocked(localizeImage).mockResolvedValue({
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

		vi.mocked(localizeImage).mockResolvedValue({
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

		vi.mocked(localizeImage).mockResolvedValue({
			ok: true,
			src: "data:image/png;base64,AAAA",
		});
		const html = '<img src="/images/a.png">';

		// Act

		await normalize(html, { baseUrl: "https://example.com/article" });

		// Assert

		expect(localizeImage).toHaveBeenCalledWith(
			"https://example.com/images/a.png",
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
		expect(localizeImage).not.toHaveBeenCalled();
	});

	it("Should only localize each unique image url once", async () => {
		// Arrange

		vi.mocked(localizeImage).mockResolvedValue({
			ok: true,
			src: "data:image/png;base64,AAAA",
		});
		const html =
			'<img src="https://example.com/a.png"><img src="https://example.com/a.png">';

		// Act

		await normalize(html, { baseUrl: null });

		// Assert

		expect(localizeImage).toHaveBeenCalledTimes(1);
	});

	it("Should localize a data uri src using the uri itself as the absolute url", async () => {
		// Arrange

		vi.mocked(localizeImage).mockResolvedValue({
			ok: true,
			src: "data:image/png;base64,AAAA",
		});
		const html = '<img src="data:image/png;base64,AAAA">';

		// Act

		const actual = await normalize(html, { baseUrl: null });

		// Assert

		expect(localizeImage).toHaveBeenCalledWith(
			"data:image/png;base64,AAAA",
			null,
		);
		expect(actual).toBe('<img src="data:image/png;base64,AAAA">');
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
