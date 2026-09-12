import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import { NodeDto } from "../../../api/elements/dto/nodeDto";
import TrashedElementBanner from "../../../features/ElementViewer/TrashedElementBanner";
import { restoreElementAction } from "../../../stores/trash/trashActions";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

vi.mock(import("../../../stores/trash/trashActions"));

const ELEMENT_ID = { type: "extract" as const, id: "extract-1" };

const CURRENT_EXTRACT: AnyElementDto = {
	type: "extract",
	data: {
		meta: {
			elementId: ELEMENT_ID,
			name: "Extract",
			parent: null,
			position: "a",
			tags: [],
			createdAt: "",
			modifiedAt: "",
			bibliographicalSourceId: null,
			derivedFrom: null,
		},
		content: "",
		intervalMultiplier: 1,
	},
};

const FOLDER_NODE: NodeDto = {
	meta: {
		elementId: { type: "folder", id: "folder-1" },
		name: "Folder",
		position: "a",
	},
	children: { folders: [], learningAssets: [], extracts: [], cards: [] },
};

function render(currentElement: AnyElementDto | null, tree: NodeDto[] = []) {
	return renderWithProviders(<TrashedElementBanner />, {
		preloadedState: {
			elements: {
				tree,
				isLoading: false,
				error: null,
				currentElement,
				zoomOwnedByCurrentView: false,
			},
		},
	});
}

describe("TrashedElementBanner", () => {
	beforeEach(() => {
		vi.mocked(restoreElementAction).mockReturnValue(() =>
			Promise.resolve(),
		);
	});

	it("Should render nothing when there is no current element", () => {
		// Arrange

		// Act

		render(null);

		// Assert

		expect(
			screen.queryByText("This element is in the trash."),
		).not.toBeInTheDocument();
	});

	it("Should render nothing when the current element is not trashed", () => {
		// Arrange

		const extractNode: NodeDto = {
			meta: CURRENT_EXTRACT.data.meta,
			children: {
				folders: [],
				learningAssets: [],
				extracts: [],
				cards: [],
			},
		};

		// Act

		render(CURRENT_EXTRACT, [
			{
				...FOLDER_NODE,
				children: { ...FOLDER_NODE.children, extracts: [extractNode] },
			},
		]);

		// Assert

		expect(
			screen.queryByText("This element is in the trash."),
		).not.toBeInTheDocument();
	});

	it("Should show that the element is trashed when it is absent from the tree", () => {
		// Arrange

		// Act

		render(CURRENT_EXTRACT, []);

		// Assert

		expect(
			screen.getByText("This element is in the trash."),
		).toBeInTheDocument();
	});

	it("Should dispatch restoreElementAction when the restore button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render(CURRENT_EXTRACT, []);

		// Act

		await user.click(screen.getByRole("button", { name: "Restore" }));

		// Assert

		expect(restoreElementAction).toHaveBeenCalledWith(ELEMENT_ID);
	});
});
