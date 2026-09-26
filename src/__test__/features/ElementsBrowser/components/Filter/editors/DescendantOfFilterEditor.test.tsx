import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DescendantOfFilterEditor from "../../../../../../features/ElementsBrowser/components/Filter/editors/DescendantOfFilterEditor";
import { DescendantOfFilter } from "../../../../../../api/savedSearches/dto/elementFilter";
import { searchElements } from "../../../../../../api/search/api/searchApi";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../../api/search/api/searchApi"));
vi.mock(import("../../../../../../api/elements/api/elementsApi"));

const FILTER: DescendantOfFilter = {
	id: "1",
	field: "descendantOf",
	operator: "is",
	ancestor: null,
};

function render(filter: DescendantOfFilter = FILTER) {
	const onChange = vi.fn();

	renderWithProviders(
		<DescendantOfFilterEditor filter={filter} onChange={onChange} />,
	);

	return { onChange };
}

describe("DescendantOfFilterEditor", () => {
	beforeEach(() => {
		vi.mocked(searchElements).mockResolvedValue([
			{
				type: "folder",
				id: "folder-1",
				name: "Physics",
				priority: { position: 1, total: 1, percentile: 0 },
				due: null,
				tags: [],
			},
		]);
	});

	it("Should call onChange with the updated operator when a new operator is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getByDisplayValue("Descendant of"));
		await user.click(await screen.findByText("Not descendant of"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({ ...FILTER, operator: "isNot" });
	});

	it("Should call onChange with the ancestor when an element is picked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getByPlaceholderText("Search for an element"));
		await user.click(await screen.findByText("Physics"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			ancestor: { type: "folder", id: "folder-1" },
		});
	});

	it("Should focus the element search when the editor opens", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByPlaceholderText("Search for an element"),
		).toHaveFocus();
	});
});
