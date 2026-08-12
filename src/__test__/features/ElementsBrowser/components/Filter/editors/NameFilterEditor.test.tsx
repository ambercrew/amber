import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NameFilterEditor from "../../../../../../features/ElementsBrowser/components/Filter/editors/NameFilterEditor";
import { NameFilter } from "../../../../../../api/savedSearches/dto/elementFilter";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

const FILTER: NameFilter = {
	id: "1",
	field: "name",
	operator: "contains",
	value: "Photosynthesis",
};

function render(filter: NameFilter = FILTER) {
	const onChange = vi.fn();

	renderWithProviders(
		<NameFilterEditor filter={filter} onChange={onChange} />,
	);

	return { onChange };
}

describe("NameFilterEditor", () => {
	it("Should pre-populate the operator and value inputs from the given filter", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getByRole("combobox")).toHaveValue("contains");
		expect(screen.getByPlaceholderText("Name")).toHaveValue(
			"Photosynthesis",
		);
	});

	it("Should call onChange with the updated operator when a new operator is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getByRole("combobox"));
		await user.click(await screen.findByText("starts with"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			operator: "startsWith",
		});
	});

	it("Should call onChange with the updated value when the text input changes", () => {
		// Arrange

		const { onChange } = render();

		// Act

		fireEvent.change(screen.getByPlaceholderText("Name"), {
			target: { value: "Mitochondria" },
		});

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			value: "Mitochondria",
		});
	});
});
