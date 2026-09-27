import { filterCommandActions } from "../../commands/useSpotlightActions";

const ACTIONS = [
	{ id: "find-in-page", label: "Find in page" },
	{
		group: "Zoom",
		actions: [
			{ id: "zoom-in", label: "Zoom in" },
			{ id: "zoom-out", label: "Zoom out" },
		],
	},
	{
		group: "Elements",
		actions: [
			{ id: "open-priority", label: "Set priority" },
			{ id: "clear-read-point", label: "Clear read point" },
		],
	},
];

describe("filterCommandActions", () => {
	it("Should hide search-only commands and their emptied groups when the query is empty", () => {
		// Arrange

		const query = "  ";

		// Act

		const actual = filterCommandActions(query, ACTIONS);

		// Assert

		expect(actual).toEqual([
			{ id: "find-in-page", label: "Find in page" },
			{
				group: "Elements",
				actions: [{ id: "open-priority", label: "Set priority" }],
			},
		]);
	});

	it("Should show search-only commands when the query matches their label", () => {
		// Arrange

		const query = "ZOOM I";

		// Act

		const actual = filterCommandActions(query, ACTIONS);

		// Assert

		expect(actual).toEqual([
			{ group: "Zoom", actions: [{ id: "zoom-in", label: "Zoom in" }] },
		]);
	});
});
