import mammoth from "mammoth";
import { extractDocx } from "../../../../features/Import/docx/extract";

vi.mock(import("mammoth"));

describe("extractDocx", () => {
	it("Should return mammoth's html when the document has content", async () => {
		// Arrange

		vi.mocked(mammoth.convertToHtml).mockResolvedValue({
			value: "<h1>Report</h1><p>Body</p>",
			messages: [],
		});

		// Act

		const actual = await extractDocx(new ArrayBuffer(0));

		// Assert

		expect(actual).toEqual({
			title: null,
			authors: null,
			publicationDate: null,
			html: "<h1>Report</h1><p>Body</p>",
		});
	});

	it("Should throw no-content when mammoth produces no html", async () => {
		// Arrange

		vi.mocked(mammoth.convertToHtml).mockResolvedValue({
			value: "  ",
			messages: [],
		});

		// Act & Assert

		await expect(extractDocx(new ArrayBuffer(0))).rejects.toThrow(
			"no-content",
		);
	});
});
