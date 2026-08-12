import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddTagModal from "../../../../../../features/ElementsBrowser/components/BulkActions/modals/AddTagModal";
import { BulkCallApi } from "../../../../../../features/ElementsBrowser/components/BulkActions/bulkCallApi";
import { addTagBulk } from "../../../../../../api/elements/api/elementsApi";
import { ElementId } from "../../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../../api/elements/api/elementsApi"));

const ELEMENT_IDS: ElementId[] = [{ type: "learningAsset", id: "asset-1" }];

const callApi: BulkCallApi = cb => cb().then(() => undefined);

function render() {
	const onClose = vi.fn();
	const onSuccess = vi.fn();

	renderWithProviders(
		<AddTagModal
			opened
			elementIds={ELEMENT_IDS}
			callApi={callApi}
			onClose={onClose}
			onSuccess={onSuccess}
		/>,
	);

	return { onClose, onSuccess };
}

describe("AddTagModal", () => {
	beforeEach(() => {
		vi.mocked(addTagBulk).mockResolvedValue(undefined);
	});

	it("Should render the title and an empty tags input when opened", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("heading", { name: "Add tag" }),
		).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Enter tag")).toBeInTheDocument();
	});

	it("Should disable Save until a tag is entered", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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

	it("Should add the entered tags to the selected elements when saved", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSuccess } = render();

		// Act

		await user.type(
			screen.getByPlaceholderText("Enter tag"),
			"math{Enter}",
		);
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() =>
			expect(addTagBulk).toHaveBeenCalledWith(ELEMENT_IDS, ["math"]),
		);
		expect(onSuccess).toHaveBeenCalled();
	});
});
