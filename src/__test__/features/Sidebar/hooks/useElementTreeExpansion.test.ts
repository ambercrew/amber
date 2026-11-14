import { act, renderHook } from "@testing-library/react";
import { TreeNodeData } from "@mantine/core";
import { useElementTreeExpansion } from "../../../../features/Sidebar/hooks/useElementTreeExpansion";

// Tree used across tests:
//
//   science-folder
//     └── biology-learning asset
//           └── cell-card
//   art-folder

function leaf(value: string): TreeNodeData {
	return { value, label: value, children: [] };
}

function node(value: string, children: TreeNodeData[]): TreeNodeData {
	return { value, label: value, children };
}

const DATA: TreeNodeData[] = [
	node("science-folder", [
		node("biology-learningAsset", [leaf("cell-card")]),
	]),
	leaf("art-folder"),
];

// @mantine/hooks' useLocalStorage dispatches its cross-instance sync event via
// `queueMicrotask`, so a functional state update (used for expanded-state
// persistence here) settles one microtask tick after the triggering act().
// Flush it inside another act() so the resulting re-render isn't reported as
// an update outside of act.
async function flushMicrotasks() {
	await act(async () => {
		/* Nothing */
	});
}

describe("useElementTreeExpansion", () => {
	beforeEach(() => window.localStorage.clear());

	it("Should start with all nodes collapsed", () => {
		// Arrange / Act

		const { result } = renderHook(() => useElementTreeExpansion(DATA));

		// Assert

		expect(result.current.treeController.expandedState).toEqual({});
	});

	it("Should expand ancestors of matching nodes when a search term is entered", () => {
		// Arrange

		const { result } = renderHook(() => useElementTreeExpansion(DATA));

		// Act — search for "cell" which is inside biology-learning asset inside science-folder

		act(() => result.current.handleSearchChange("cell"));

		// Assert — both ancestor folders must be open to show the match

		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);
		expect(
			result.current.treeController.expandedState[
				"biology-learningAsset"
			],
		).toBe(true);
	});

	it("Should return only matching nodes and their ancestors in filteredData when searching", () => {
		// Arrange

		const { result } = renderHook(() => useElementTreeExpansion(DATA));

		// Act

		act(() => result.current.handleSearchChange("cell"));

		// Assert — art-folder does not match and is absent; science-folder is kept as an ancestor

		const values = result.current.filteredData.map(n => n.value);
		expect(values).not.toContain("art-folder");
		expect(values).toContain("science-folder");
	});

	it("Should return the full data in filteredData when search is empty", () => {
		// Arrange

		const { result } = renderHook(() => useElementTreeExpansion(DATA));

		// Act — search then clear

		act(() => result.current.handleSearchChange("cell"));
		act(() => result.current.handleSearchChange(""));

		// Assert

		expect(result.current.filteredData).toBe(DATA);
	});

	it("Should restore pre-search expanded state when search is cleared", async () => {
		// Arrange — start with science-folder manually expanded

		const { result } = renderHook(() => useElementTreeExpansion(DATA));
		act(() => result.current.treeController.expand("science-folder"));
		await flushMicrotasks();

		act(() => result.current.handleSearchChange("art"));

		// Sanity: science-folder should be collapsed during the search (art doesn't match it)
		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBeFalsy();

		// Act

		act(() => result.current.handleSearchChange(""));
		await flushMicrotasks();

		// Assert — pre-search state is restored

		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);
	});

	it("Should not expand anything beyond the pre-search state when search is cleared", () => {
		// Arrange

		const { result } = renderHook(() => useElementTreeExpansion(DATA));

		act(() => result.current.handleSearchChange("cell"));
		act(() => result.current.handleSearchChange(""));

		// Assert — nothing extra is expanded beyond the empty pre-search state

		expect(result.current.treeController.expandedState).toEqual({});
	});

	it("Should not expand the ancestors of a selected node when navigating to it", async () => {
		// Arrange

		const { result, rerender } = renderHook<
			ReturnType<typeof useElementTreeExpansion>,
			{ data: TreeNodeData[] }
		>(({ data }) => useElementTreeExpansion(data), {
			initialProps: { data: DATA },
		});

		// Act — the tree changes, as on a rename or sync, which used to re-reveal the selection

		rerender({ data: [...DATA] });
		await flushMicrotasks();

		// Assert

		expect(result.current.treeController.expandedState).toEqual({});
	});

	it("Should expand and persist the ancestors when an element is revealed", async () => {
		// Arrange

		const { result } = renderHook(() => useElementTreeExpansion(DATA));

		// Act

		let revealed = false;
		act(() => {
			revealed = result.current.reveal("cell-card");
		});
		await flushMicrotasks();

		// Assert

		expect(revealed).toBe(true);
		expect(result.current.treeController.expandedState).toEqual({
			"science-folder": true,
			"biology-learningAsset": true,
		});
		const { result: fresh } = renderHook(() =>
			useElementTreeExpansion(DATA),
		);
		expect(
			fresh.current.treeController.expandedState["biology-learningAsset"],
		).toBe(true);
	});

	it("Should clear the search and keep the pre-search expansion when an element is revealed while searching", async () => {
		// Arrange

		const { result } = renderHook(() => useElementTreeExpansion(DATA));
		act(() => result.current.treeController.expand("art-folder"));
		await flushMicrotasks();
		act(() => result.current.handleSearchChange("art"));

		// Act

		act(() => {
			result.current.reveal("cell-card");
		});
		await flushMicrotasks();

		// Assert

		expect(result.current.search).toBe("");
		expect(result.current.filteredData).toBe(DATA);
		expect(result.current.treeController.expandedState).toEqual({
			"art-folder": true,
			"science-folder": true,
			"biology-learningAsset": true,
		});
	});

	it("Should return false and expand nothing when the revealed element is not in the tree", () => {
		// Arrange

		const { result } = renderHook(() => useElementTreeExpansion(DATA));

		// Act

		let revealed = true;
		act(() => {
			revealed = result.current.reveal("missing");
		});

		// Assert

		expect(revealed).toBe(false);
		expect(result.current.treeController.expandedState).toEqual({});
	});
});
