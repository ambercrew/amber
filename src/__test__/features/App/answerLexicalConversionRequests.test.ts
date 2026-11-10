import { convertLexicalToHtml } from "../../../features/App/answerLexicalConversionRequests";

describe("answerLexicalConversionRequests", () => {
	it("Should report the failure when a document isn't Lexical JSON", () => {
		// Arrange

		const event = { requestId: "1", contents: ["not json"] };

		// Act

		const actual = convertLexicalToHtml(event);

		// Assert

		expect(actual).toHaveProperty("error");
	});
});
