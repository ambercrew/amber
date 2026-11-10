import { convertImportedHtml } from "../../../features/Import/convertImportedHtml";
import { domToLexicalJson } from "../../../components/Editor/lexicalJsonConversion";
import { normalizeDocument } from "../../../features/Import/normalize";

vi.mock(import("../../../components/Editor/lexicalJsonConversion"));
vi.mock(import("../../../features/Import/normalize"));

describe("convertImportedHtml", () => {
	beforeEach(() => {
		vi.mocked(normalizeDocument).mockImplementation(async doc => doc.body);
		vi.mocked(domToLexicalJson).mockImplementation(
			dom => `lexical ${(dom as HTMLElement).innerHTML}`,
		);
	});

	it("Should normalize and convert each fragment in order when given fragments", async () => {
		// Arrange

		const htmls = ["<b>hablar</b>", "to speak"];

		// Act

		const actual = await convertImportedHtml({
			requestId: "request-1",
			htmls,
		});

		// Assert

		expect(normalizeDocument).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ baseUrl: null }),
		);
		expect(actual).toEqual({
			contents: ["lexical <b>hablar</b>", "lexical to speak"],
		});
	});

	it("Should report the error when a fragment fails to convert", async () => {
		// Arrange

		vi.mocked(normalizeDocument).mockRejectedValue(new Error("boom"));

		// Act

		const actual = await convertImportedHtml({
			requestId: "request-1",
			htmls: ["<p>x</p>"],
		});

		// Assert

		expect(actual).toEqual({ error: "boom" });
	});
});
