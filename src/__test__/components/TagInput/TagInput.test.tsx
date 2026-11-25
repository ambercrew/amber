import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TagInput from "../../../components/TagInput/TagInput";
import { searchTags } from "../../../api/elements/api/elementsApi";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

vi.mock(import("../../../api/elements/api/elementsApi"));

function render(value: string[] = []) {
	const onChange = vi.fn();
	renderWithProviders(
		<TagInput
			placeholder="Tags"
			defaultValue={value}
			onChange={onChange}
		/>,
	);
	return { onChange, input: screen.getByPlaceholderText("Tags") };
}

describe("TagInput", () => {
	beforeEach(() => {
		vi.mocked(searchTags).mockImplementation(async query =>
			["philosophy", "history", "prehistory"].filter(tag =>
				tag.includes(query.trim().toLowerCase()),
			),
		);
	});

	it("Should suggest the existing tags matching the search when typing", async () => {
		// Arrange

		const user = userEvent.setup();
		const { input } = render();

		// Act

		await user.click(input);
		await user.type(input, "hist");

		// Assert

		const options = await screen.findAllByRole("option");
		expect(options.map(o => o.textContent)).toEqual([
			"history",
			"prehistory",
		]);
	});

	it("Should add the suggestion when one is picked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { input, onChange } = render();
		await user.click(input);
		await user.type(input, "phil");

		// Act

		await user.click(
			await screen.findByRole("option", { name: "philosophy" }),
		);

		// Assert

		expect(onChange).toHaveBeenLastCalledWith(["philosophy"]);
	});

	it("Should add a new tag when one not in use is entered", async () => {
		// Arrange

		const user = userEvent.setup();
		const { input, onChange } = render();

		// Act

		await user.type(input, "math{Enter}");

		// Assert

		expect(onChange).toHaveBeenLastCalledWith(["math"]);
	});

	it("Should use the existing tag's case when a tag differing only by case is entered", async () => {
		// Arrange

		const user = userEvent.setup();
		const { input, onChange } = render();
		await user.click(input);
		await user.type(input, "History");
		await waitFor(() =>
			expect(searchTags).toHaveBeenLastCalledWith("History", 50),
		);

		// Act

		await user.keyboard("{Enter}");

		// Assert

		expect(onChange).toHaveBeenLastCalledWith(["history"]);
	});

	it("Should leave picked tags out of the suggestions when some are picked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { input } = render(["history"]);

		// Act

		await user.click(input);
		await user.type(input, "hist");

		// Assert

		const options = await screen.findAllByRole("option");
		expect(options.map(o => o.textContent)).toEqual(["prehistory"]);
	});
});
