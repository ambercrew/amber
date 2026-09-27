import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeDto } from "../../../../../api/elements/dto/nodeDto";
import ElementTreeHarness from "../../../../test-utils/ElementTreeHarness";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../stores/elements/elementsActions"));
vi.mock(import("../../../../../stores/trash/trashActions"));

const TREE: NodeDto[] = [
	{
		meta: {
			elementId: { type: "folder", id: "folder-science" },
			name: "Science",
			position: "0",
		},
		children: { folders: [], learningAssets: [], extracts: [], cards: [] },
	},
];

describe("ElementTree delete", () => {
	beforeEach(() => window.localStorage.clear());

	function render() {
		return renderWithProviders(<ElementTreeHarness tree={TREE} />);
	}

	it("Should open the move to trash confirmation modal when Move to trash is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act — right-click Science to open the context menu, then trash it

		await user.pointer({
			target: screen.getByLabelText("Science"),
			keys: "[MouseRight]",
		});
		await waitFor(
			() => expect(screen.getByText("Move to trash")).toBeInTheDocument(),
			{ timeout: 2000 },
		);
		await user.click(screen.getByText("Move to trash"));

		// Assert — the confirmation modal is shown

		await waitFor(() => {
			expect(
				screen.getByText(
					/This element and everything under it will be moved to the trash/,
				),
			).toBeInTheDocument();
		});
	});
});
