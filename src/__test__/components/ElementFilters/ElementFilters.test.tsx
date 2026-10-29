import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElementFilters from "../../../components/ElementFilters/ElementFilters";
import { ElementFilter } from "../../../api/savedSearches/dto/elementFilter";
import { createDefaultFilter } from "../../../components/ElementFilters/utils/createDefaultFilter";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

function render(filters: ElementFilter[] = []) {
	const onChange = vi.fn();

	renderWithProviders(
		<ElementFilters
			filters={filters}
			onChange={onChange}
			sources={[]}
			profiles={[]}
		/>,
	);

	return { onChange };
}

describe("ElementFilters", () => {
	it("Should add a default filter for the field when one is picked from the menu", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();
		await user.click(screen.getByRole("button", { name: "Filter" }));

		// Act

		await user.click(await screen.findByRole("menuitem", { name: "Name" }));

		// Assert

		expect(onChange).toHaveBeenCalledWith([
			expect.objectContaining({ field: "name" }),
		]);
	});

	it("Should drop only that filter when a chip's remove button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const name = createDefaultFilter("name");
		const tags = createDefaultFilter("tags");
		const { onChange } = render([name, tags]);

		// Act

		await user.click(
			screen.getByRole("button", { name: "Remove Name filter" }),
		);

		// Assert

		expect(onChange).toHaveBeenCalledWith([tags]);
	});
});
