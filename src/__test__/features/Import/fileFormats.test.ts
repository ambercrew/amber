import {
	detectFileFormat,
	FILE_FORMATS_ACCEPT,
	SUPPORTED_FORMATS_ALL,
} from "../../../features/Import/fileFormats";
import { pdfFormat } from "../../../features/Import/pdf/format";
import { epubFormat } from "../../../features/Import/epub/format";
import { markdownFormat } from "../../../features/Import/markdown/format";
import { htmlFormat } from "../../../features/Import/html/format";
import { textFormat } from "../../../features/Import/text/format";

const ZIP_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

function detect(name: string, type: string, bytes = new Uint8Array()) {
	return detectFileFormat(new File([bytes], name, { type }), bytes.buffer);
}

describe("detectFileFormat", () => {
	it.each([
		["paper.PDF", "", pdfFormat],
		["page.htm", "", htmlFormat],
		["page.xhtml", "", htmlFormat],
		["notes.txt", "", textFormat],
		["notes.markdown", "", markdownFormat],
	])(
		"Should detect the format by extension when given %s",
		(name, type, expected) => {
			// Arrange & Act

			const actual = detect(name, type);

			// Assert

			expect(actual).toBe(expected);
		},
	);

	it("Should prefer the extension over the reported type when a .md file is reported as text/plain", () => {
		// Arrange & Act

		const actual = detect("notes.md", "text/plain");

		// Assert

		expect(actual).toBe(markdownFormat);
	});

	it("Should detect an EPUB by its signature when the file has no known extension", () => {
		// Arrange & Act

		const actual = detect("book", "application/octet-stream", ZIP_HEADER);

		// Assert

		expect(actual).toBe(epubFormat);
	});

	it("Should fall back to the reported type when the name and bytes reveal nothing", () => {
		// Arrange & Act

		const actual = detect("download", "application/pdf");

		// Assert

		expect(actual).toBe(pdfFormat);
	});

	it("Should return null when the file matches no format", () => {
		// Arrange & Act

		const actual = detect("image.png", "image/png");

		// Assert

		expect(actual).toBeNull();
	});
});

describe("FILE_FORMATS_ACCEPT", () => {
	it("Should list only mime types when built", () => {
		// Arrange & Act

		const actual = FILE_FORMATS_ACCEPT;

		// Assert

		expect(actual).toContain("application/pdf");
		expect(actual).toContain("text/markdown");
		expect(actual.some(type => type.startsWith("."))).toBe(false);
	});
});

describe("SUPPORTED_FORMATS_ALL", () => {
	it("Should list every format's label when built", () => {
		// Arrange & Act

		const actual = SUPPORTED_FORMATS_ALL;

		// Assert

		expect(actual).toBe("PDF, EPUB, Markdown, HTML, and text");
	});
});
