import { convertImportedHtml } from "../../../features/Import/convertImportedHtml";
import { htmlToLexicalJson } from "../../../components/Editor/lexicalJsonConversion";
import { normalize } from "../../../features/Import/normalize";

vi.mock(import("../../../components/Editor/lexicalJsonConversion"));
vi.mock(import("../../../features/Import/normalize"));

describe("convertImportedHtml", () => {
	it("Should normalize and convert each fragment in order when given fragments", async () => {
		// Arrange

		vi.mocked(normalize).mockImplementation(
			async html => `normalized ${html}`,
		);
		vi.mocked(htmlToLexicalJson).mockImplementation(
			html => `lexical ${html}`,
		);

		// Act

		const actual = await convertImportedHtml({
			requestId: "request-1",
			htmls: ["<b>hablar</b>", "to speak"],
		});

		// Assert

		expect(normalize).toHaveBeenCalledWith(
			"<b>hablar</b>",
			expect.objectContaining({ baseUrl: null }),
		);
		expect(actual).toEqual({
			contents: [
				"lexical normalized <b>hablar</b>",
				"lexical normalized to speak",
			],
		});
	});

	it("Should report the error when a fragment fails to convert", async () => {
		// Arrange

		vi.mocked(normalize).mockRejectedValue(new Error("boom"));

		// Act

		const actual = await convertImportedHtml({
			requestId: "request-1",
			htmls: ["<p>x</p>"],
		});

		// Assert

		expect(actual).toEqual({ error: "boom" });
	});
});
