import { screen } from "@testing-library/react";
import FilterEditor from "../../../../../features/ElementsBrowser/components/Filter/FilterEditor";
import { ElementFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { createDefaultFilter } from "../../../../../features/ElementsBrowser/utils/createDefaultFilter";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

function render(filter: ElementFilter) {
	const onChange = vi.fn();

	renderWithProviders(
		<FilterEditor
			filter={filter}
			sources={[]}
			profiles={[]}
			onChange={onChange}
		/>,
	);

	return { onChange };
}

describe("FilterEditor", () => {
	it("Should render the NameFilterEditor when the filter's field is name", () => {
		// Arrange, Act

		render(createDefaultFilter("name"));

		// Assert

		expect(screen.getByPlaceholderText("Name")).toBeInTheDocument();
	});

	it("Should render the TagsFilterEditor when the filter's field is tags", () => {
		// Arrange, Act

		render(createDefaultFilter("tags"));

		// Assert

		expect(screen.getByPlaceholderText("Add tags")).toBeInTheDocument();
	});

	it("Should render the DateFilterEditor when the filter's field is dueDate", () => {
		// Arrange, Act

		render(createDefaultFilter("dueDate"));

		// Assert

		expect(screen.getByText("today")).toBeInTheDocument();
	});

	it("Should render the DateFilterEditor when the filter's field is createdDate", () => {
		// Arrange, Act

		render(createDefaultFilter("createdDate"));

		// Assert

		expect(screen.getByLabelText("Days")).toBeInTheDocument();
	});

	it("Should render the BibliographicalSourceFilterEditor when the filter's field is bibliographicalSource", () => {
		// Arrange, Act

		render(createDefaultFilter("bibliographicalSource"));

		// Assert

		expect(
			screen.getByPlaceholderText("Select bibliographical sources"),
		).toBeInTheDocument();
	});

	it("Should render the ElementTypeFilterEditor when the filter's field is elementType", () => {
		// Arrange, Act

		render(createDefaultFilter("elementType"));

		// Assert

		expect(
			screen.getByPlaceholderText("Select element types"),
		).toBeInTheDocument();
	});

	it("Should render the PriorityFilterEditor when the filter's field is priority", () => {
		// Arrange, Act

		render(createDefaultFilter("priority"));

		// Assert

		expect(screen.getByText("Priority 70.00–100.00%")).toBeInTheDocument();
	});

	it("Should render the StudyProfileFilterEditor when the filter's field is studyProfile", () => {
		// Arrange, Act

		render(createDefaultFilter("studyProfile"));

		// Assert

		expect(
			screen.getByPlaceholderText("Select study profiles"),
		).toBeInTheDocument();
	});
});
