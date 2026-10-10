import { sanitizeHtml } from "../../utils/sanitizeHtml";

describe("sanitizeHtml", () => {
	it("Should keep allowed tags and attributes", () => {
		// Arrange

		const html =
			'<p><a href="https://example.com">link</a> <img src="https://example.com/a.png" alt="a"></p>';

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).toContain('<a href="https://example.com">link</a>');
		expect(actual).toContain(
			'<img src="https://example.com/a.png" alt="a">',
		);
	});

	it("Should strip disallowed tags but keep their text content", () => {
		// Arrange

		const html = "<script>alert(1)</script><div>kept text</div>";

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).not.toContain("<script>");
		expect(actual).not.toContain("<div>");
		expect(actual).toContain("kept text");
	});

	it("Should strip disallowed attributes such as event handlers", () => {
		// Arrange

		const html = '<p onclick="doEvil()">hello</p>';

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).not.toContain("onclick");
		expect(actual).toContain("hello");
	});

	it("Should strip a javascript: href", () => {
		// Arrange

		const html = '<a href="javascript:alert(1)">click</a>';

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		// eslint-disable-next-line no-script-url -- asserting it was stripped
		expect(actual).not.toContain("javascript:");
	});

	it("Should allow a data:image src", () => {
		// Arrange

		const html = '<img src="data:image/png;base64,AAAA">';

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).toContain("data:image/png;base64,AAAA");
	});

	it("Should keep the src when it is a stored asset src", () => {
		// Arrange

		const src = `amber-asset:${"a".repeat(64)}`;
		const html = `<img src="${src}">`;

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).toContain(src);
	});

	it("Should keep the src when it is a runtime asset url", () => {
		// Arrange

		const src = `amber-asset://localhost/${"a".repeat(64)}`;
		const html = `<img src="${src}">`;

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).toContain(src);
	});

	it("Should strip a disallowed non-http, non-data protocol from src", () => {
		// Arrange

		const html = '<img src="ftp://example.com/a.png">';

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).not.toContain("ftp://");
	});

	it("Should keep a relative image src so it can later be resolved against a base url", () => {
		// Arrange

		const html = '<img src="/images/a.png">';

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).toBe('<img src="/images/a.png">');
	});

	it("Should keep a protocol-relative image src", () => {
		// Arrange

		const html = '<img src="//cdn.example.com/a.png">';

		// Act

		const actual = sanitizeHtml(html);

		// Assert

		expect(actual).toBe('<img src="//cdn.example.com/a.png">');
	});
});
