import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SetSourceModal from "../../../../../../features/ElementsBrowser/components/BulkActions/modals/SetSourceModal";
import { BulkCallApi } from "../../../../../../features/ElementsBrowser/components/BulkActions/bulkCallApi";
import { assignBibliographicalSourceBulk } from "../../../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { BibliographicalSourceResponseDto } from "../../../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { ElementId } from "../../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

vi.mock(
	import("../../../../../../api/bibliographicalSources/api/bibliographicalSourcesApi"),
);

const ELEMENT_IDS: ElementId[] = [{ type: "learningAsset", id: "asset-1" }];

const SOURCE: BibliographicalSourceResponseDto = {
	id: "source-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
	title: "Some book",
	authors: null,
	publicationDate: null,
	sourceType: "File",
	location: null,
	elementCount: 1,
};

const callApi: BulkCallApi = cb => cb().then(() => undefined);

function render() {
	const onClose = vi.fn();
	const onSuccess = vi.fn();

	renderWithProviders(
		<SetSourceModal
			opened
			elementIds={ELEMENT_IDS}
			sources={[SOURCE]}
			callApi={callApi}
			onClose={onClose}
			onSuccess={onSuccess}
		/>,
	);

	return { onClose, onSuccess };
}

describe("SetSourceModal", () => {
	beforeEach(() => {
		vi.mocked(assignBibliographicalSourceBulk).mockResolvedValue(undefined);
	});

	it("Should render the title and default to None when opened", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("heading", { name: "Set source" }),
		).toBeInTheDocument();
		expect(screen.getByDisplayValue("None")).toBeInTheDocument();
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

	it("Should assign null when saved without changing the selection", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSuccess } = render();

		// Act

		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() =>
			expect(assignBibliographicalSourceBulk).toHaveBeenCalledWith(
				ELEMENT_IDS,
				null,
			),
		);
		expect(onSuccess).toHaveBeenCalled();
	});

	it("Should assign the selected source's id when a source is picked and saved", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSuccess } = render();

		// Act

		await user.click(screen.getByDisplayValue("None"));
		await user.click(await screen.findByText("Some book"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() =>
			expect(assignBibliographicalSourceBulk).toHaveBeenCalledWith(
				ELEMENT_IDS,
				SOURCE.id,
			),
		);
		expect(onSuccess).toHaveBeenCalled();
	});
});
