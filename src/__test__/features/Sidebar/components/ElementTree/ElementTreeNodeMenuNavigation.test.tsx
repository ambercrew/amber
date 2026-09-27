import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeDto } from "../../../../../api/elements/dto/nodeDto";
import ElementTreeHarness from "../../../../test-utils/ElementTreeHarness";
import { useIsCoarsePointer } from "../../../../../hooks/useIsCoarsePointer";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../hooks/useIsCoarsePointer"));

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

describe("ElementTreeNode actions menu navigation", () => {
	beforeEach(() => {
		window.localStorage.clear();
		// The menu button is only reachable without hover with a coarse pointer.
		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
	});

	it("Should not select the element when its actions menu is used", async () => {
		// Arrange

		const user = userEvent.setup();
		renderWithProviders(<ElementTreeHarness tree={TREE} />);
		await user.click(screen.getByLabelText("Open actions menu"));
		await waitFor(() =>
			expect(screen.getByText("New")).toBeInTheDocument(),
		);

		// Act — open the "New" submenu

		await user.click(screen.getByText("New"));

		// Assert — the route is untouched, so the sidebar stays open

		expect(screen.getByTestId(LOCATION_DISPLAY_TEST_ID)).toHaveTextContent(
			"/",
		);
		expect(
			screen.getByTestId(LOCATION_DISPLAY_TEST_ID),
		).not.toHaveTextContent("folder-science");
	});
});
