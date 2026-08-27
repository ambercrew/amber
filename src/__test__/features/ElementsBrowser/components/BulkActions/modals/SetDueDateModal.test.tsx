import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SetDueDateModal from "../../../../../../features/ElementsBrowser/components/BulkActions/modals/SetDueDateModal";
import { BulkCallApi } from "../../../../../../features/ElementsBrowser/components/BulkActions/bulkCallApi";
import { setElementDueBulk } from "../../../../../../api/study/api/studyApi";
import { ElementId } from "../../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../../api/study/api/studyApi"));

const ELEMENT_IDS: ElementId[] = [{ type: "card", id: "card-1" }];

const callApi: BulkCallApi = cb => cb().then(() => undefined);

function render(defaultDue?: string | null) {
	const onClose = vi.fn();
	const onSuccess = vi.fn();

	renderWithProviders(
		<SetDueDateModal
			opened
			elementIds={ELEMENT_IDS}
			defaultDue={defaultDue}
			callApi={callApi}
			onClose={onClose}
			onSuccess={onSuccess}
		/>,
	);

	return { onClose, onSuccess };
}

describe("SetDueDateModal", () => {
	beforeEach(() => {
		vi.mocked(setElementDueBulk).mockResolvedValue(undefined);
	});

	it("Should render the title and disable Save when no date is picked", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("heading", { name: "Set due date" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	it("Should prefill the picker and enable Save when a default due date is given", () => {
		// Arrange, Act

		render("2024-06-15T10:00:00.000Z");

		// Assert

		expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
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
