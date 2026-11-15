import { ElementContentMatchesDto } from "../../../../api/search/dto/searchContentResponseDto";
import { flattenSearchResults } from "../../../../features/Sidebar/utils/flattenSearchResults";

function element(id: string, matchCount: number): ElementContentMatchesDto {
	return {
		elementId: { type: "extract", id },
		name: id,
		matches: Array.from({ length: matchCount }, (_, index) => ({
			index,
			before: "",
			text: "match",
			after: "",
		})),
	};
}

describe("flattenSearchResults", () => {
	it("Should list each element followed by its matches when nothing is collapsed", () => {
		// Arrange

		const elements = [element("a", 2), element("b", 1)];

		// Act

		const actual = flattenSearchResults(elements, new Set());

		// Assert

		expect(actual.map(row => row.key)).toEqual([
			"a",
			"a:0",
			"a:1",
			"b",
			"b:0",
		]);
	});

	it("Should hide a collapsed element's matches when its id is collapsed", () => {
		// Arrange

		const elements = [element("a", 2), element("b", 1)];

		// Act

		const actual = flattenSearchResults(elements, new Set(["a"]));

		// Assert

		expect(actual.map(row => row.key)).toEqual(["a", "b", "b:0"]);
		expect(actual[0]).toMatchObject({ kind: "element", collapsed: true });
	});
});
