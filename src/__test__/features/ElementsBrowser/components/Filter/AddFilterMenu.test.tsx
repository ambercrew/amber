import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddFilterMenu from "../../../../../features/ElementsBrowser/components/Filter/AddFilterMenu";
import { filterFieldGroups } from "../../../../../features/ElementsBrowser/utils/filterFieldMeta";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

function render() {
	const onSelect = vi.fn();

	renderWithProviders(<AddFilterMenu onSelect={onSelect} />);

	return { onSelect };
}

describe("AddFilterMenu", () => {
	it("Should list every filter field in group order when the menu is opened", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await user.click(screen.getByRole("button", { name: "Filter" }));

		// Assert

		const items = await screen.findAllByRole("menuitem");
		expect(items.map(item => item.textContent)).toEqual(
			filterFieldGroups.flatMap(group =>
				group.fields.map(meta => meta.label),
			),
		);
	});

	it("Should show a heading for each group when the menu is opened", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await user.click(screen.getByRole("button", { name: "Filter" }));

		// Assert

		for (const group of filterFieldGroups) {
			expect(await screen.findByText(group.label)).toBeInTheDocument();
		}
	});

	it("Should call onSelect with the field when a menu item is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSelect } = render();
		await user.click(screen.getByRole("button", { name: "Filter" }));

		// Act

		await user.click(await screen.findByRole("menuitem", { name: "Tags" }));

		// Assert

		expect(onSelect).toHaveBeenCalledWith("tags");
	});
});
