import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteSavedSearchModal from "../../../../../features/ElementsBrowser/components/SavedSearch/DeleteSavedSearchModal";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

const SAVED_SEARCH_NAME = "Math cards";

function render() {
	const onClose = vi.fn();
	const onConfirm = vi.fn();

	renderWithProviders(
		<DeleteSavedSearchModal
			opened
			savedSearchName={SAVED_SEARCH_NAME}
			onClose={onClose}
			onConfirm={onConfirm}
		/>,
	);

	return { onClose, onConfirm };
}

describe("DeleteSavedSearchModal", () => {
	it("Should show the saved search's name in the confirmation message", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByText(new RegExp(SAVED_SEARCH_NAME)),
		).toBeInTheDocument();
	});

	it("Should call onConfirm when Delete is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onConfirm } = render();

		// Act

		await user.click(screen.getByRole("button", { name: "Delete" }));

		// Assert

		expect(onConfirm).toHaveBeenCalled();
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
