import {
	convertInlineSvgs,
	toBase64SvgDataUri,
} from "../../../../features/Import/images/svg";

function parse(html: string): Document {
	return new DOMParser().parseFromString(html, "text/html");
}

function decodeSvgSrc(img: Element): string {
	const src = img.getAttribute("src")!;
	const base64 = src.slice(src.indexOf(",") + 1);
	return new TextDecoder().decode(
		Uint8Array.from(atob(base64), char => char.charCodeAt(0)),
	);
}

describe("toBase64SvgDataUri", () => {
	it("Should return the uri unchanged when it is already base64", () => {
		// Arrange

		const uri = "data:image/svg+xml;base64,AAAA";

		// Act

		const actual = toBase64SvgDataUri(uri);

		// Assert

		expect(actual).toBe(uri);
	});

	it("Should base64-encode the markup as utf-8 when the uri is url-encoded", () => {
		// Arrange

		const uri =
			"data:image/svg+xml;charset=utf-8,%3Csvg%3E%CE%B1%3C%2Fsvg%3E";

		// Act

		const actual = toBase64SvgDataUri(uri);

		// Assert

		const bytes = new TextEncoder().encode("<svg>α</svg>");
		expect(actual).toBe(
			`data:image/svg+xml;base64,${btoa(String.fromCharCode(...bytes))}`,
		);
	});

	it("Should return null when the url-encoding is malformed", () => {
		// Arrange

		const uri = "data:image/svg+xml,%E0%A4%A";

		// Act

		const actual = toBase64SvgDataUri(uri);

		// Assert

		expect(actual).toBeNull();
	});
});

describe("convertInlineSvgs", () => {
	it("Should replace an inline svg with an image of it when it is a drawing", () => {
		// Arrange

		const doc = parse(
			'<p><svg width="40" height="20"><title>Diagram</title><circle r="5"></circle></svg></p>',
		);

		// Act

		convertInlineSvgs(doc);

		// Assert

		expect(doc.querySelector("svg")).toBeNull();
		const img = doc.querySelector("img")!;
		expect(img.getAttribute("alt")).toBe("Diagram");
		expect(img.getAttribute("src")).toMatch(
			/^data:image\/svg\+xml;base64,/,
		);
		const markup = decodeSvgSrc(img);
		expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(markup).toContain("<circle");
	});

	it("Should convert only the outer svg when svgs are nested", () => {
		// Arrange

		const doc = parse("<svg><svg><rect></rect></svg></svg>");

		// Act

		convertInlineSvgs(doc);

		// Assert

		expect(doc.querySelectorAll("img")).toHaveLength(1);
	});

	it("Should leave the svg as it was when it is decorative or a sprite reference", () => {
		// Arrange

		const doc = parse(
			'<svg aria-hidden="true"><path d="M0 0"></path></svg><svg><use href="#icon"></use></svg>',
		);

		// Act

		convertInlineSvgs(doc);

		// Assert

		expect(doc.querySelectorAll("svg")).toHaveLength(2);
		expect(doc.querySelector("img")).toBeNull();
	});
});
