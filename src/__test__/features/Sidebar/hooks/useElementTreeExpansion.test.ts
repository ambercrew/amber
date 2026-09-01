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

	it("Should expand ancestors of the selected node when search is cleared", async () => {
		// Arrange — cell-card is selected; nothing was expanded before searching

		const { result } = renderHook(() =>
			useElementTreeExpansion(DATA, "cell-card"),
		);
		await flushMicrotasks();

		act(() => result.current.handleSearchChange("art"));
		act(() => result.current.handleSearchChange(""));
		await flushMicrotasks();

		// Assert — the path to cell-card must be open: science-folder and biology-learning asset

		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);
		expect(
			result.current.treeController.expandedState[
				"biology-learningAsset"
			],
		).toBe(true);
	});

	it("Should merge pre-search expanded state with selected ancestors on clear", async () => {
		// Arrange — art-folder was expanded before searching; biology-learning asset is selected

		const { result } = renderHook(() =>
			useElementTreeExpansion(DATA, "biology-learningAsset"),
		);
		act(() => result.current.treeController.expand("art-folder"));
		await flushMicrotasks();

		act(() => result.current.handleSearchChange("cell"));
		act(() => result.current.handleSearchChange(""));
		await flushMicrotasks();

		// Assert — both pre-search expansion and selected ancestors are present

		expect(result.current.treeController.expandedState["art-folder"]).toBe(
			true,
		);
		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);
	});

	it("Should not expand selected ancestors if selectedId is absent", () => {
		// Arrange

		const { result } = renderHook(() => useElementTreeExpansion(DATA));

		act(() => result.current.handleSearchChange("cell"));
		act(() => result.current.handleSearchChange(""));

		// Assert — nothing extra is expanded beyond the empty pre-search state

		expect(result.current.treeController.expandedState).toEqual({});
	});

	it("Should expand ancestors of the selected node on initial render", async () => {
		// Arrange / Act — cell-card is selected from the very first render, no search involved

		const { result } = renderHook(() =>
			useElementTreeExpansion(DATA, "cell-card"),
		);
		await flushMicrotasks();

		// Assert — the path to cell-card is opened automatically

		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);
		expect(
			result.current.treeController.expandedState[
				"biology-learningAsset"
			],
		).toBe(true);
	});

	it("Should expand ancestors of the newly selected node when navigating without searching", async () => {
		// Arrange — nothing selected initially

		const { result, rerender } = renderHook<
			ReturnType<typeof useElementTreeExpansion>,
			{ selectedId: string | null }
		>(({ selectedId }) => useElementTreeExpansion(DATA, selectedId), {
			initialProps: { selectedId: null },
		});

		expect(result.current.treeController.expandedState).toEqual({});

		// Act — simulate navigating to cell-card

		rerender({ selectedId: "cell-card" });
		await flushMicrotasks();

		// Assert — the path to cell-card is revealed

		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);
		expect(
			result.current.treeController.expandedState[
				"biology-learningAsset"
			],
		).toBe(true);
	});

	it("Should not expand anything when the selected node has no ancestors", () => {
		// Arrange / Act — art-folder is a top-level node with no parents

		const { result } = renderHook(() =>
			useElementTreeExpansion(DATA, "art-folder"),
		);

		// Assert

		expect(result.current.treeController.expandedState).toEqual({});
	});

	it("Should expand ancestors of the selected node while studying", async () => {
		// Arrange / Act — cell-card is selected during a study session

		const { result } = renderHook(() =>
			useElementTreeExpansion(DATA, "cell-card", true),
		);
		await flushMicrotasks();

		// Assert — the path to cell-card is revealed

		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);
		expect(
			result.current.treeController.expandedState[
				"biology-learningAsset"
			],
		).toBe(true);
	});

	it("Should collapse ancestors that were not previously expanded once study moves to a sibling", async () => {
		// Arrange — nothing expanded beforehand; study reveals cell-card's ancestors

		const { result, rerender } = renderHook<
			ReturnType<typeof useElementTreeExpansion>,
			{ selectedId: string | null }
		>(({ selectedId }) => useElementTreeExpansion(DATA, selectedId, true), {
			initialProps: { selectedId: "cell-card" },
		});
		await flushMicrotasks();
		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);

		// Act — study moves on to a node with no shared ancestors

		rerender({ selectedId: "art-folder" });
		await flushMicrotasks();

		// Assert — the auto-expanded ancestor collapses again since nothing else needs it open

		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBeFalsy();
		expect(
			result.current.treeController.expandedState[
				"biology-learningAsset"
			],
		).toBeFalsy();
	});

	it("Should keep an ancestor expanded after study moves past it when it was already expanded beforehand", async () => {
		// Arrange — science-folder is manually expanded before studying starts

		const { result, rerender } = renderHook<
			ReturnType<typeof useElementTreeExpansion>,
			{ selectedId: string | null }
		>(({ selectedId }) => useElementTreeExpansion(DATA, selectedId, true), {
			initialProps: { selectedId: null },
		});
		act(() => result.current.treeController.expand("science-folder"));
		await flushMicrotasks();

		rerender({ selectedId: "cell-card" });
		await flushMicrotasks();

		// Act — study moves on to a node outside science-folder

		rerender({ selectedId: "art-folder" });
		await flushMicrotasks();

		// Assert — science-folder stays expanded since it wasn't auto-expanded by study

		expect(
			result.current.treeController.expandedState["science-folder"],
		).toBe(true);
	});

	it("Should not persist study auto-expansion to storage", async () => {
		// Arrange / Act — cell-card is revealed while studying

		renderHook(() => useElementTreeExpansion(DATA, "cell-card", true));
		await flushMicrotasks();

		// Assert — a fresh, non-studying instance does not see the ancestors as expanded

		const { result: freshResult } = renderHook(() =>
			useElementTreeExpansion(DATA),
		);
		expect(
			freshResult.current.treeController.expandedState["science-folder"],
		).toBeFalsy();
	});
});
