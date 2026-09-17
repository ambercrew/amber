import { PropsWithChildren } from "react";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { RootState, setupStore } from "../../../../stores/store";
import { NodeDto } from "../../../../api/elements/dto/nodeDto";
import { useFolderTrail } from "../../../../features/ElementViewer/hooks/useFolderTrail";
import { ElementId } from "../../../../types/elements/elementId";

function folderNode(
	id: string,
	name: string,
	folders: NodeDto[] = [],
	cards: NodeDto[] = [],
): NodeDto {
	return {
		meta: { elementId: { type: "folder", id }, name, position: "a" },
		children: { folders, learningAssets: [], extracts: [], cards },
	};
}

function cardNode(id: string, name: string): NodeDto {
	return {
		meta: { elementId: { type: "card", id }, name, position: "a" },
		children: { folders: [], learningAssets: [], extracts: [], cards: [] },
	};
}

function preloadedState(tree: NodeDto[]): Partial<RootState> {
	return {
		elements: {
			tree,
			isLoading: false,
			error: null,
			currentElement: null,
			zoomOwnedByCurrentView: false,
		},
	};
}

function renderTrail(
	tree: NodeDto[],
	folderId: ElementId | null,
	folderName: string | null = null,
) {
	const store = setupStore(preloadedState(tree));

	function Wrapper({ children }: PropsWithChildren) {
		return <Provider store={store}>{children}</Provider>;
	}

	return renderHook(() => useFolderTrail(folderId, folderName), {
		wrapper: Wrapper,
	});
}

describe("useFolderTrail", () => {
	it("Should return an empty trail when no folder is given", () => {
		// Arrange

		const tree = [folderNode("root", "Root")];

		// Act

		const { result } = renderTrail(tree, null);

		// Assert

		expect(result.current).toEqual([]);
	});

	it("Should return the folder itself when it is at the top level", () => {
		// Arrange

		const tree = [folderNode("root", "Root")];

		// Act

		const { result } = renderTrail(tree, { type: "folder", id: "root" });

		// Assert

		expect(result.current).toEqual([{ id: "root", name: "Root" }]);
	});

	it("Should return every ancestor from the root down when the folder is nested", () => {
		// Arrange

		const tree = [
			folderNode("root", "Root", [
				folderNode("middle", "Middle", [folderNode("leaf", "Leaf")]),
			]),
		];

		// Act

		const { result } = renderTrail(tree, { type: "folder", id: "leaf" });

		// Assert

		expect(result.current).toEqual([
			{ id: "root", name: "Root" },
			{ id: "middle", name: "Middle" },
			{ id: "leaf", name: "Leaf" },
		]);
	});

	it("Should search sibling subtrees when the folder is not in the first branch", () => {
		// Arrange

		const tree = [
			folderNode("first", "First", [folderNode("buried", "Buried")]),
			folderNode("second", "Second", [folderNode("target", "Target")]),
		];

		// Act

		const { result } = renderTrail(tree, { type: "folder", id: "target" });

		// Assert

		expect(result.current).toEqual([
			{ id: "second", name: "Second" },
			{ id: "target", name: "Target" },
		]);
	});

	it("Should skip non-folder children when walking the tree", () => {
		// Arrange

		const tree = [
			folderNode(
				"root",
				"Root",
				[folderNode("child", "Child")],
				[cardNode("card", "A card")],
			),
		];

		// Act

		const { result } = renderTrail(tree, { type: "folder", id: "child" });

		// Assert

		expect(result.current).toEqual([
			{ id: "root", name: "Root" },
			{ id: "child", name: "Child" },
		]);
	});

	it("Should fall back to the given name when the folder is missing from the tree", () => {
		// Arrange

		const tree = [folderNode("root", "Root")];

		// Act

		const { result } = renderTrail(
			tree,
			{ type: "folder", id: "trashed" },
			"Trashed folder",
		);

		// Assert

		expect(result.current).toEqual([
			{ id: "trashed", name: "Trashed folder" },
		]);
	});

	it("Should fall back to an empty name when the folder is missing and has no name", () => {
		// Arrange

		const tree: NodeDto[] = [];

		// Act

		const { result } = renderTrail(tree, { type: "folder", id: "gone" });

		// Assert

		expect(result.current).toEqual([{ id: "gone", name: "" }]);
	});
});
