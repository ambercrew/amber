import { searchHighlightRegistry } from "../../../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistry";

function makeRange(): Range {
	return {} as Range;
}

beforeEach(() => {
	searchHighlightRegistry.clearAll();
});

describe("searchHighlightRegistry", () => {
	it("Should return undefined ranges for an editor that never reported any", () => {
		// Act

		const actual = searchHighlightRegistry.getRanges("unknown");

		// Assert

		expect(actual).toBeUndefined();
	});

	it("Should return the ranges last set for an editor", () => {
		// Arrange

		const ranges = [makeRange(), makeRange()];

		// Act

		searchHighlightRegistry.setAll("split-1", ranges);

		// Assert

		expect(searchHighlightRegistry.getRanges("split-1")).toBe(ranges);
	});

	it("Should aggregate ranges from every editor when flattening", () => {
		// Arrange

		const rangesA = [makeRange()];
		const rangesB = [makeRange(), makeRange()];

		// Act

		searchHighlightRegistry.setAll("split-1", rangesA);
		searchHighlightRegistry.setAll("split-2", rangesB);

		// Assert

		expect(searchHighlightRegistry.getAllRangesFlat()).toEqual([
			...rangesA,
			...rangesB,
		]);
	});

	it("Should drop an editor's ranges from the aggregate when cleared", () => {
		// Arrange

		const rangesA = [makeRange()];
		const rangesB = [makeRange()];
		searchHighlightRegistry.setAll("split-1", rangesA);
		searchHighlightRegistry.setAll("split-2", rangesB);

		// Act

		searchHighlightRegistry.clear("split-1");

		// Assert

		expect(searchHighlightRegistry.getAllRangesFlat()).toEqual(rangesB);
		expect(searchHighlightRegistry.getRanges("split-1")).toBeUndefined();
	});

	it("Should return the current range when one is set", () => {
		// Arrange

		const range = makeRange();

		// Act

		searchHighlightRegistry.setCurrent(range);

		// Assert

		expect(searchHighlightRegistry.getCurrentRange()).toBe(range);
	});

	it("Should clear every editor's ranges and the current match when clearAll is called", () => {
		// Arrange

		searchHighlightRegistry.setAll("split-1", [makeRange()]);
		searchHighlightRegistry.setAll("split-2", [makeRange()]);
		searchHighlightRegistry.setCurrent(makeRange());

		// Act

		searchHighlightRegistry.clearAll();

		// Assert

		expect(searchHighlightRegistry.getAllRangesFlat()).toEqual([]);
		expect(searchHighlightRegistry.getCurrentRange()).toBeNull();
	});

	it("Should notify subscribers when ranges change", () => {
		// Arrange

		const listener = vi.fn();
		const unsubscribe = searchHighlightRegistry.subscribe(listener);

		// Act

		searchHighlightRegistry.setAll("split-1", [makeRange()]);
		searchHighlightRegistry.setCurrent(null);
		unsubscribe();
		searchHighlightRegistry.clear("split-1");

		// Assert

		expect(listener).toHaveBeenCalledTimes(2);
	});
});
