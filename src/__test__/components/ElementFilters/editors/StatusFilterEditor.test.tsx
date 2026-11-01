import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatusFilterEditor from "../../../../components/ElementFilters/editors/StatusFilterEditor";
import { StatusFilter } from "../../../../api/savedSearches/dto/elementFilter";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

const FILTER: StatusFilter = {
	id: "1",
	field: "status",
	operator: "isAnyOf",
	statuses: ["suspended"],
};

function render(filter: StatusFilter = FILTER) {
	const onChange = vi.fn();

	renderWithProviders(
		<StatusFilterEditor filter={filter} onChange={onChange} />,
	);

	return { onChange };
}

describe("StatusFilterEditor", () => {
	it("Should pre-populate the operator and selected statuses when given a filter", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getAllByRole("combobox")[0]).toHaveValue("is any of");
		expect(
			screen
				.getAllByText("Suspended")
				.some(el => el.closest(".mantine-Pill-root") !== null),
		).toBe(true);
	});

	it("Should call onChange with the added status when a new status is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getByPlaceholderText("Select statuses"));
		await user.click(await screen.findByText("Finished"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			statuses: ["suspended", "finished"],
		});
	});
});
