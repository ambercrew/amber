import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TagsFilterEditor from "../../../../../../features/ElementsBrowser/components/Filter/editors/TagsFilterEditor";
import { TagsFilter } from "../../../../../../api/savedSearches/dto/elementFilter";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

const FILTER: TagsFilter = {
	id: "1",
	field: "tags",
	operator: "isAnyOf",
	tags: ["math"],
};

function render(filter: TagsFilter = FILTER) {
	const onChange = vi.fn();

	renderWithProviders(
		<TagsFilterEditor filter={filter} onChange={onChange} />,
	);

	return { onChange };
}

describe("TagsFilterEditor", () => {
	it("Should pre-populate the operator and tags inputs from the given filter", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getAllByRole("combobox")[0]).toHaveValue("is any of");
		expect(screen.getByText("math")).toBeInTheDocument();
	});

	it("Should call onChange with the updated operator when a new operator is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getAllByRole("combobox")[0]);
		await user.click(await screen.findByText("is all of"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			operator: "isAllOf",
		});
	});

	it("Should call onChange with the added tag when a new tag is entered", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.type(
			screen.getByPlaceholderText("Add tags"),
			"biology{Enter}",
		);

		// Assert

		expect(onChange).toHaveBeenLastCalledWith({
			...FILTER,
			tags: ["math", "biology"],
		});
	});

	it("Should call onChange with the tag removed when its remove button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();
		const pill = screen.getByText("math").closest(".mantine-Pill-root");

		// Act

		await user.click(
			within(pill as HTMLElement).getByRole("button", { hidden: true }),
		);

		// Assert

		expect(onChange).toHaveBeenCalledWith({ ...FILTER, tags: [] });
	});
});
