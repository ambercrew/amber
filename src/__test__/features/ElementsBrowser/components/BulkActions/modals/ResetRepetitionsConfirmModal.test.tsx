import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetRepetitionsConfirmModal from "../../../../../../features/ElementsBrowser/components/BulkActions/modals/ResetRepetitionsConfirmModal";
import { BulkCallApi } from "../../../../../../features/ElementsBrowser/components/BulkActions/bulkCallApi";
import { resetRepetitionsBulk } from "../../../../../../api/study/api/studyApi";
import { ElementId } from "../../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../../api/study/api/studyApi"));

const ELEMENT_IDS: ElementId[] = [{ type: "card", id: "card-1" }];

const callApi: BulkCallApi = cb => cb().then(() => undefined);

function render() {
	const onClose = vi.fn();
	const onSuccess = vi.fn();

	renderWithProviders(
		<ResetRepetitionsConfirmModal
			opened
			elementIds={ELEMENT_IDS}
			callApi={callApi}
			onClose={onClose}
			onSuccess={onSuccess}
		/>,
	);

	return { onClose, onSuccess };
}

describe("ResetRepetitionsConfirmModal", () => {
	beforeEach(() => {
		vi.mocked(resetRepetitionsBulk).mockResolvedValue(undefined);
	});

	it("Should render the title and confirmation message when opened", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("heading", { name: "Reset repetitions" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(/scheduling progress for the 1 selected card/),
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

	it("Should reset repetitions and call onSuccess when confirmed", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSuccess } = render();

		// Act

		await user.click(
			screen.getByRole("button", { name: "Reset repetitions" }),
		);

		// Assert

		await waitFor(() =>
			expect(resetRepetitionsBulk).toHaveBeenCalledWith(ELEMENT_IDS),
		);
		expect(onSuccess).toHaveBeenCalled();
	});
});
