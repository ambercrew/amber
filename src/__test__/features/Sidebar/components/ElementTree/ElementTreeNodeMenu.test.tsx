import { screen } from "@testing-library/react";
import { NodeDto } from "../../../../../api/elements/dto/nodeDto";
import ElementTreeHarness from "../../../../test-utils/ElementTreeHarness";
import { useIsCoarsePointer } from "../../../../../hooks/useIsCoarsePointer";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

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

describe("ElementTreeNode actions menu", () => {
	beforeEach(() => window.localStorage.clear());

	function renderMenuButton() {
		renderWithProviders(<ElementTreeHarness tree={TREE} />);
		return screen.getByLabelText("Open actions menu");
	}

	it("Should show the actions menu when the pointer is coarse", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);

		// Act

		const actual = renderMenuButton();

		// Assert

		expect(actual.style.visibility).toBe("visible");
	});

	it("Should hide the actions menu until hovered when the pointer is fine", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		const actual = renderMenuButton();

		// Assert

		expect(actual.style.visibility).toBe("hidden");
	});
});
