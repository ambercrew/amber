import { isSavedSearchEdited } from "../../../../features/ElementsBrowser/utils/isSavedSearchEdited";
import { TagsFilter } from "../../../../api/savedSearches/dto/elementFilter";

const tagsFilter: TagsFilter = {
	id: "1",
	field: "tags",
	operator: "isAnyOf",
	tags: ["math"],
};

describe("isSavedSearchEdited", () => {
	it("Should return false when no saved search is loaded", () => {
		// Arrange

		const filters = [tagsFilter];

		// Act

		const actual = isSavedSearchEdited(filters, null);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should return false when live filters match the loaded saved search's filters", () => {
		// Arrange

		const filters = [tagsFilter];
		const loadedFilters = [tagsFilter];

		// Act

		const actual = isSavedSearchEdited(filters, loadedFilters);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should return true when live filters differ from the loaded saved search's filters", () => {
		// Arrange

		const filters = [tagsFilter];
		const loadedFilters: TagsFilter[] = [];

		// Act

		const actual = isSavedSearchEdited(filters, loadedFilters);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should return false when filters are equal but their object keys are in a different order", () => {
		// Arrange

		const filters = [tagsFilter];
		const loadedFilters: TagsFilter[] = [
			{
				operator: tagsFilter.operator,
				tags: tagsFilter.tags,
				field: tagsFilter.field,
				id: tagsFilter.id,
			},
		];

		// Act

		const actual = isSavedSearchEdited(filters, loadedFilters);

		// Assert

		expect(actual).toBe(false);
	});
});
