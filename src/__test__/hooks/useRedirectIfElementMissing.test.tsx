import { screen, waitFor } from "@testing-library/react";
import { useRedirectIfElementMissing } from "../../hooks/useRedirectIfElementMissing";
import { useElementParams } from "../../hooks/useElementParams";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../test-utils/renderWithProviders";
import { NodeDto } from "../../api/elements/dto/nodeDto";
import { elementExists } from "../../api/elements/api/elementsApi.ts";

vi.mock(import("../../hooks/useElementParams"));
vi.mock(import("../../api/elements/api/elementsApi.ts"));

const TREE: NodeDto[] = [
	{
		meta: {
			elementId: {
				type: "folder",
				id: "folder-1",
			},
			name: "Science",
			position: "0",
		},
		children: { folders: [], learningAssets: [], extracts: [], cards: [] },
	},
];

const PRELOADED_STATE = {
	elements: {
		tree: TREE,
		isLoading: false,
		error: null,
		currentElement: null,
		zoomOwnedByCurrentView: false,
	},
};

function HookWrapper() {
	useRedirectIfElementMissing();
	return null;
}

function render(initialEntries = ["/folder/folder-1"]) {
	return renderWithProviders(<HookWrapper />, {
		preloadedState: PRELOADED_STATE,
		memoryRouterProps: { initialEntries },
	});
}

describe("useRedirectIfElementMissing", () => {
	it("Should navigate to root when params are null", async () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue(null);

		// Act

		render(["/folder/folder-1"]);

		// Assert

		await waitFor(() => {
			expect(
				screen.getByTestId(LOCATION_DISPLAY_TEST_ID),
			).toHaveTextContent("/");
		});
	});

	it("Should navigate to root when params are incomplete", async () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "",
		} as never);

		// Act

		render(["/folder/"]);

		// Assert

		await waitFor(() => {
			expect(
				screen.getByTestId(LOCATION_DISPLAY_TEST_ID),
			).toHaveTextContent("/");
		});
	});

	it("Should not navigate when the element exists in the tree", () => {
		// Arrange

		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "folder-1",
		});

		// Act

		render();

		// Assert

		expect(screen.getByTestId(LOCATION_DISPLAY_TEST_ID)).toHaveTextContent(
			"/folder/folder-1",
		);
	});

	it("Should navigate to root when the element is not in the tree, even with no prior history to go back to", async () => {
		// Arrange

		vi.mocked(elementExists).mockResolvedValue(false);
		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "folder-missing",
		});

		// Act

		render(["/folder/folder-missing"]);

		// Assert

		await waitFor(() => {
			expect(
				screen.getByTestId(LOCATION_DISPLAY_TEST_ID),
			).toHaveTextContent("/");
		});
	});

	it("Should navigate to root when the element is not in the tree, even with a long history of other missing elements", async () => {
		// Arrange

		vi.mocked(elementExists).mockResolvedValue(false);
		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "folder-missing",
		});

		// Act

		render([
			"/folder/also-missing-1",
			"/folder/also-missing-2",
			"/folder/also-missing-3",
			"/folder/folder-missing",
		]);

		// Assert

		await waitFor(() => {
			expect(
				screen.getByTestId(LOCATION_DISPLAY_TEST_ID),
			).toHaveTextContent("/");
		});
	});
});
