import { act, renderHook, waitFor } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { MantineProvider } from "@mantine/core";
import { useCurrentElementSync } from "../../hooks/useCurrentElementSync";
import { useElementParams } from "../../hooks/useElementParams";
import {
	elementExists,
	getElementById,
} from "../../api/elements/api/elementsApi";
import { setupStore } from "../../stores/store";
import { AnyElementDto } from "../../api/elements/dto/anyElementDto";
import { NodeDto } from "../../api/elements/dto/nodeDto";

vi.mock(import("../../hooks/useElementParams"));
vi.mock(import("../../api/elements/api/elementsApi"));

const FOLDER_NODE: NodeDto = {
	meta: {
		elementId: { type: "folder", id: "folder-1" },
		name: "Science",
		position: "0",
	},
	children: { folders: [], learningAssets: [], extracts: [], cards: [] },
};

const FOLDER_ELEMENT: AnyElementDto = {
	type: "folder",
	data: {
		meta: {
			elementId: { type: "folder", id: "folder-1" },
			name: "Science",
			position: "0",
			parent: null,
			tags: [],
			createdAt: "2024-01-01T00:00:00Z",
			modifiedAt: "2024-01-01T00:00:00Z",
			bibliographicalSourceId: null,
			derivedFrom: null,
		},
	},
};

function makeStore(tree: NodeDto[] = [FOLDER_NODE]) {
	return setupStore({
		elements: {
			tree,
			isLoading: false,
			error: null,
			currentElement: null,
			zoomOwnedByCurrentView: false,
		},
	});
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
	return function Wrapper({ children }: PropsWithChildren) {
		return (
			<MantineProvider>
				<MemoryRouter>
					<Provider store={store}>{children}</Provider>
				</MemoryRouter>
			</MantineProvider>
		);
	};
}

describe("useCurrentElementSync", () => {
	it("Should set currentElement to null when no params", () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue(null);
		const store = makeStore();

		// Act

		renderHook(() => useCurrentElementSync(), {
			wrapper: makeWrapper(store),
		});

		// Assert

		expect(store.getState().elements.currentElement).toBeNull();
		expect(elementExists).not.toHaveBeenCalled();
	});

	it("Should set currentElement to null when element does not exist", async () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "folder-missing",
		});
		vi.mocked(elementExists).mockResolvedValue(false);
		const store = makeStore();

		// Act

		renderHook(() => useCurrentElementSync(), {
			wrapper: makeWrapper(store),
		});

		// Assert

		await waitFor(() => expect(elementExists).toHaveBeenCalled());
		expect(store.getState().elements.currentElement).toBeNull();
		expect(getElementById).not.toHaveBeenCalled();
	});

	it("Should set currentElement in store when element exists", async () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "folder-1",
		});
		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(getElementById).mockResolvedValue(FOLDER_ELEMENT);
		const store = makeStore();

		// Act

		renderHook(() => useCurrentElementSync(), {
			wrapper: makeWrapper(store),
		});

		// Assert

		await waitFor(() => {
			expect(store.getState().elements.currentElement).toEqual(
				FOLDER_ELEMENT,
			);
		});
	});

	it("Should clear currentElement when params become null", async () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "folder-1",
		});
		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(getElementById).mockResolvedValue(FOLDER_ELEMENT);
		const store = makeStore();

		const { rerender } = renderHook(() => useCurrentElementSync(), {
			wrapper: makeWrapper(store),
		});

		await waitFor(() =>
			expect(store.getState().elements.currentElement).toEqual(
				FOLDER_ELEMENT,
			),
		);

		// Act

		vi.mocked(useElementParams).mockReturnValue(null);
		rerender();

		// Assert

		expect(store.getState().elements.currentElement).toBeNull();
	});

	it("Should refetch when tree changes", async () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "folder-1",
		});
		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(getElementById).mockResolvedValue(FOLDER_ELEMENT);
		const store = makeStore();

		renderHook(() => useCurrentElementSync(), {
			wrapper: makeWrapper(store),
		});
		await waitFor(() =>
			expect(store.getState().elements.currentElement).toEqual(
				FOLDER_ELEMENT,
			),
		);

		const updatedElement: AnyElementDto = {
			...FOLDER_ELEMENT,
			data: {
				meta: { ...FOLDER_ELEMENT.data.meta, name: "Science Updated" },
			},
		};
		vi.mocked(getElementById).mockResolvedValue(updatedElement);

		// Act

		act(() => {
			store.dispatch({
				type: "elements/setTree",
				payload: [FOLDER_NODE],
			});
		});

		// Assert

		await waitFor(() => {
			expect(
				store.getState().elements.currentElement?.data.meta.name,
			).toBe("Science Updated");
		});
	});
});
