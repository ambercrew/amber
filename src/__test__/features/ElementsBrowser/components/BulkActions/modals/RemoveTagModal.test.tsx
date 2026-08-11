import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RemoveTagModal from "../../../../../../features/ElementsBrowser/components/BulkActions/modals/RemoveTagModal";
import { BulkCallApi } from "../../../../../../features/ElementsBrowser/components/BulkActions/bulkCallApi";
import { removeTagBulk } from "../../../../../../api/elements/api/elementsApi";
import { SearchElementResultDto } from "../../../../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../../api/elements/api/elementsApi"));

const ELEMENT_IDS: ElementId[] = [{ type: "learningAsset", id: "asset-1" }];

const TAG_TIMESTAMPS = {
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
};

const SELECTED_RESULTS: SearchElementResultDto[] = [
	{
		type: "learningAsset",
		id: "asset-1",
		name: "Asset one",
		priority: { rank: 1, total: 2, percentage: 100 },
		due: null,
		tags: [
			{ name: "math", ...TAG_TIMESTAMPS },
			{ name: "science", ...TAG_TIMESTAMPS },
		],
	},
	{
		type: "learningAsset",
		id: "asset-2",
		name: "Asset two",
		priority: { rank: 2, total: 2, percentage: 50 },
		due: null,
		tags: [{ name: "math", ...TAG_TIMESTAMPS }],
	},
];

const callApi: BulkCallApi = cb => cb().then(() => undefined);

function render(selectedResults: SearchElementResultDto[] = SELECTED_RESULTS) {
	const onClose = vi.fn();
	const onSuccess = vi.fn();

	renderWithProviders(
		<RemoveTagModal
			opened
			elementIds={ELEMENT_IDS}
			selectedResults={selectedResults}
			callApi={callApi}
			onClose={onClose}
			onSuccess={onSuccess}
		/>,
	);

	return { onClose, onSuccess };
}

describe("RemoveTagModal", () => {
	beforeEach(() => {
		vi.mocked(removeTagBulk).mockResolvedValue(undefined);
	});

	it("Should render the title when opened", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("heading", { name: "Remove tag" }),
		).toBeInTheDocument();
	});

	it("Should offer the deduplicated set of tags found on the selected elements", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await user.click(screen.getByPlaceholderText("Select tags to remove"));

		// Assert

		expect(await screen.findByText("math")).toBeInTheDocument();
		expect(screen.getByText("science")).toBeInTheDocument();
	});

	it("Should disable Save until a tag is selected", () => {
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

	it("Should remove the selected tags from the selected elements when saved", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSuccess } = render();

		// Act

		await user.click(screen.getByPlaceholderText("Select tags to remove"));
		await user.click(await screen.findByText("math"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() =>
			expect(removeTagBulk).toHaveBeenCalledWith(ELEMENT_IDS, ["math"]),
		);
		expect(onSuccess).toHaveBeenCalled();
	});
});
