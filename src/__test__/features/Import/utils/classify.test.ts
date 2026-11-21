import {
	asUrl,
	classifyPaste,
} from "../../../../features/Import/utils/classify";

function makeDataTransfer({
	files = [],
	text = "",
	html = "",
}: {
	files?: File[];
	text?: string;
	html?: string;
}): DataTransfer {
	return {
		files,
		getData: (format: string) => {
			if (format === "text/plain") return text;
			if (format === "text/html") return html;
			return "";
		},
	} as unknown as DataTransfer;
}

describe("asUrl", () => {
	it("Should return null when text is empty", () => {
		// Arrange

		const text = "";

		// Act

		const actual = asUrl(text);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return null when text contains whitespace", () => {
		// Arrange

		const text = "https://example.com some text";

		// Act

		const actual = asUrl(text);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return the href when text is a valid http url", () => {
		// Arrange

		const text = "http://example.com/page";

		// Act

		const actual = asUrl(text);

		// Assert

		expect(actual).toBe("http://example.com/page");
	});

	it("Should return the href when text is a valid https url", () => {
		// Arrange

		const text = "https://example.com/page";

		// Act

		const actual = asUrl(text);

		// Assert

		expect(actual).toBe("https://example.com/page");
	});

	it("Should return null when the url protocol is not http or https", () => {
		// Arrange

		const text = "ftp://example.com/file";

		// Act

		const actual = asUrl(text);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should retry with https when text looks like a schemeless domain", () => {
		// Arrange

		const text = "example.com/page";

		// Act

		const actual = asUrl(text);

		// Assert

		expect(actual).toBe("https://example.com/page");
	});

	it("Should return null when text is not url-like at all", () => {
		// Arrange

		const text = "just some plain text";

		// Act

		const actual = asUrl(text);

		// Assert

		expect(actual).toBeNull();
	});
});

describe("classifyPaste", () => {
	it("Should classify as file when dataTransfer has files", () => {
		// Arrange

		const file = new File(["content"], "doc.pdf", {
			type: "application/pdf",
		});
		const dt = makeDataTransfer({ files: [file] });

		// Act

		const actual = classifyPaste(dt);

		// Assert

		expect(actual).toEqual({ kind: "file", files: [file] });
	});

	it("Should classify as url when pasted text is a valid url", () => {
		// Arrange

		const dt = makeDataTransfer({ text: "https://example.com" });

		// Act

		const actual = classifyPaste(dt);

		// Assert

		expect(actual).toEqual({ kind: "url", url: "https://example.com/" });
	});

	it("Should classify as content when html is present", () => {
		// Arrange

		const dt = makeDataTransfer({ text: "hi", html: "<p>hi</p>" });

		// Act

		const actual = classifyPaste(dt);

		// Assert

		expect(actual).toEqual({
			kind: "content",
			html: "<p>hi</p>",
			text: "hi",
		});
	});

	it("Should classify as content when text spans multiple lines", () => {
		// Arrange

		const dt = makeDataTransfer({ text: "line one\nline two" });

		// Act

		const actual = classifyPaste(dt);

		// Assert

		expect(actual).toEqual({
			kind: "content",
			html: null,
			text: "line one\nline two",
		});
	});

	it("Should classify as content when text is longer than the minimum length", () => {
		// Arrange

		const text = "a".repeat(201);
		const dt = makeDataTransfer({ text });

		// Act

		const actual = classifyPaste(dt);

		// Assert

		expect(actual).toEqual({ kind: "content", html: null, text });
	});

	it("Should classify as ambiguous when text is short plain single-line text", () => {
		// Arrange

		const dt = makeDataTransfer({ text: "short text" });

		// Act

		const actual = classifyPaste(dt);

		// Assert

		expect(actual).toEqual({ kind: "ambiguous", text: "short text" });
	});
});
