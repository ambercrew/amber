import { elementStudyScope } from "../../utils/studyScope";

describe("elementStudyScope", () => {
	it("Should cover the element and its descendants when given an element", () => {
		// Arrange

		const element = { type: "extract" as const, id: "extract-1" };

		// Act

		const actual = elementStudyScope(element);

		// Assert

		expect(actual).toEqual({
			type: "custom",
			filters: [
				expect.objectContaining({
					field: "descendantOf",
					operator: "isOrSelf",
					ancestor: element,
				}),
			],
		});
	});
});
