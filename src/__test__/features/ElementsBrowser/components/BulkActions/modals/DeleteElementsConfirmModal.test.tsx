import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteElementsConfirmModal from "../../../../../../features/ElementsBrowser/components/BulkActions/modals/DeleteElementsConfirmModal";
import { BulkCallApi } from "../../../../../../features/ElementsBrowser/components/BulkActions/bulkCallApi";
import { trashElementsBulk } from "../../../../../../api/trash/api/trashApi";
import { ElementId } from "../../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../../api/trash/api/trashApi"));

const ELEMENT_IDS: ElementId[] = [{ type: "learningAsset", id: "asset-1" }];

const callApi: BulkCallApi = cb => cb().then(() => undefined);

function render() {
	const onClose = vi.fn();
	const onSuccess = vi.fn();

	renderWithProviders(
		<DeleteElementsConfirmModal
			opened
			elementIds={ELEMENT_IDS}
			callApi={callApi}
			onClose={onClose}
			onSuccess={onSuccess}
		/>,
	);

	return { onClose, onSuccess };
}

describe("DeleteElementsConfirmModal", () => {
	beforeEach(() => {
		vi.mocked(trashElementsBulk).mockResolvedValue(undefined);
	});

	it("Should render the title and confirmation message when opened", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("heading", { name: "Delete elements" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(/1 selected element.*moved to the trash/s),
		).toBeInTheDocument();
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

	it("Should trash the elements and call onSuccess when confirmed", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSuccess } = render();

		// Act

		await user.click(screen.getByRole("button", { name: "Delete" }));

		// Assert

		await waitFor(() =>
			expect(trashElementsBulk).toHaveBeenCalledWith(ELEMENT_IDS),
		);
		expect(onSuccess).toHaveBeenCalled();
	});
});
