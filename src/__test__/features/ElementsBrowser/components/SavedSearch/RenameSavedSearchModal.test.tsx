import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RenameSavedSearchModal from "../../../../../features/ElementsBrowser/components/SavedSearch/RenameSavedSearchModal";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

const INITIAL_NAME = "Math cards";

function render() {
	const onClose = vi.fn();
	const onConfirm = vi.fn();

	renderWithProviders(
		<RenameSavedSearchModal
			opened
			initialName={INITIAL_NAME}
			onClose={onClose}
			onConfirm={onConfirm}
		/>,
	);

	return { onClose, onConfirm };
}

describe("RenameSavedSearchModal", () => {
	it("Should pre-fill the input with initialName", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getByRole("textbox")).toHaveValue(INITIAL_NAME);
	});

	it("Should call onConfirm with the edited name when Rename is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onConfirm } = render();

		// Act

		await user.clear(screen.getByRole("textbox"));
		await user.type(screen.getByRole("textbox"), "Renamed search");
		await user.click(screen.getByRole("button", { name: "Rename" }));

		// Assert

		expect(onConfirm).toHaveBeenCalledWith("Renamed search");
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
