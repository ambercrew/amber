import { nextSearchSort } from "../../../../features/ElementsBrowser/utils/searchSort";

describe("nextSearchSort", () => {
	it("Should start ascending when a different column is chosen", () => {
		// Arrange, Act

		const actual = nextSearchSort(
			{ column: "priority", direction: "desc" },
			"name",
		);

		// Assert

		expect(actual).toEqual({ column: "name", direction: "asc" });
	});

	it("Should flip the direction when the sorted column is chosen again", () => {
		// Arrange, Act

		const actual = nextSearchSort(
			{ column: "name", direction: "asc" },
			"name",
		);

		// Assert

		expect(actual).toEqual({ column: "name", direction: "desc" });
	});
});
