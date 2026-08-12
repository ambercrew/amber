import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SaveSavedSearchModal from "../../../../../features/ElementsBrowser/components/SavedSearch/SaveSavedSearchModal";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

function render() {
	const onClose = vi.fn();
	const onConfirm = vi.fn();

	renderWithProviders(
		<SaveSavedSearchModal opened onClose={onClose} onConfirm={onConfirm} />,
	);

	return { onClose, onConfirm };
}

describe("SaveSavedSearchModal", () => {
	it("Should render a text input for the name", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getByRole("textbox")).toBeInTheDocument();
	});

	it("Should disable the Save button when the name is empty", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	it("Should call onConfirm with the typed name when Save is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onConfirm } = render();

		// Act

		await user.type(screen.getByRole("textbox"), "New search");
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		expect(onConfirm).toHaveBeenCalledWith("New search");
	});

	it("Should call onClose when Cancel is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onClose } = render();

		// Act

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		// Assert

		expect(onClose).toHaveBeenCalled();
	});
});
