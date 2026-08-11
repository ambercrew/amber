import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElementTypeFilterEditor from "../../../../../../features/ElementsBrowser/components/Filter/editors/ElementTypeFilterEditor";
import { ElementTypeFilter } from "../../../../../../api/savedSearches/dto/elementFilter";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

const FILTER: ElementTypeFilter = {
	id: "1",
	field: "elementType",
	operator: "isAnyOf",
	types: ["card"],
};

function render(filter: ElementTypeFilter = FILTER) {
	const onChange = vi.fn();

	renderWithProviders(
		<ElementTypeFilterEditor filter={filter} onChange={onChange} />,
	);

	return { onChange };
}

function getPillByText(text: string): HTMLElement {
	const pill = screen
		.getAllByText(text)
		.map(el => el.closest(".mantine-Pill-root"))
		.find(el => el !== null);
	if (!pill) {
		throw new Error(`No pill found for text: ${text}`);
	}
	return pill as HTMLElement;
}

describe("ElementTypeFilterEditor", () => {
	it("Should pre-populate the operator and selected types from the given filter", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getAllByRole("combobox")[0]).toHaveValue("is any of");
		expect(getPillByText("Card")).toBeInTheDocument();
	});

	it("Should call onChange with the updated operator when a new operator is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getAllByRole("combobox")[0]);
		await user.click(await screen.findByText("is none of"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			operator: "isNoneOf",
		});
	});

	it("Should call onChange with the added type when a new element type is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getByPlaceholderText("Select element types"));
		await user.click(await screen.findByText("Extract"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			types: ["card", "extract"],
		});
	});

	it("Should call onChange with the type removed when its pill remove button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();
		const pill = getPillByText("Card");

		// Act

		await user.click(within(pill).getByRole("button", { hidden: true }));

		// Assert

		expect(onChange).toHaveBeenCalledWith({ ...FILTER, types: [] });
	});
});
