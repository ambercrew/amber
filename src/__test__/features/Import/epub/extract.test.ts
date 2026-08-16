import { extractEpub } from "../../../../features/Import/epub/extract";
import { extractEpub as invokeExtractEpub } from "../../../../api/import/api/importApi";

vi.mock(import("../../../../api/import/api/importApi"));

describe("extractEpub", () => {
	it("Should base64-encode the bytes before invoking the backend", async () => {
		// Arrange

		const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer;
		vi.mocked(invokeExtractEpub).mockResolvedValue({
			title: "T",
			authors: null,
			publicationDate: null,
			html: "<p>h</p>",
			chapterCount: 1,
		});

		// Act

		await extractEpub(bytes);

		// Assert

		expect(invokeExtractEpub).toHaveBeenCalledWith("UEsDBA==");
	});

	it("Should resolve with the backend result", async () => {
		// Arrange

		const bytes = new ArrayBuffer(4);
		vi.mocked(invokeExtractEpub).mockResolvedValue({
			title: "Title",
			authors: "Jane Doe",
			publicationDate: "2020-01-01",
			html: "<p>content</p>",
			chapterCount: 3,
		});

		// Act

		const actual = await extractEpub(bytes);

		// Assert

		expect(actual).toEqual({
			title: "Title",
			authors: "Jane Doe",
			publicationDate: "2020-01-01",
			html: "<p>content</p>",
			chapterCount: 3,
		});
	});

	it("Should reject when the backend call rejects", async () => {
		// Arrange

		const bytes = new ArrayBuffer(4);
		vi.mocked(invokeExtractEpub).mockRejectedValue(new Error("no-content"));

		// Act & Assert

		await expect(extractEpub(bytes)).rejects.toThrow("no-content");
	});
});
