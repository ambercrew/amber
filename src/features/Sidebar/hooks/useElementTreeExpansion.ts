import {
	filterTreeData,
	getTreeExpandedState,
	TreeNodeData,
	useTree,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAncestorsOf } from "../utils/elementTreeUtils";

let lastFilter: {
	data: TreeNodeData[];
	query: string;
	filtered: TreeNodeData[];
} | null = null;

/** Both the shown nodes and their expansion need the filtered tree, which is slow to get on a big one. */
function filterTree(data: TreeNodeData[], query: string) {
	if (lastFilter?.data !== data || lastFilter.query !== query)
		lastFilter = { data, query, filtered: filterTreeData(data, query) };
	return lastFilter.filtered;
}

/**
 * The tree's expanded nodes. Only the user expands them: by hand, by searching,
 * by creating from a node's menu, by revealing an element or by importing one
 * (`useTreeRevealRequest`), never by opening one.
 */
export function useElementTreeExpansion(data: TreeNodeData[]) {
	const [persistedExpandedState, setPersistedExpandedState] = useLocalStorage<
		Record<string, boolean>
	>({
		key: "element-tree-expanded",
		defaultValue: {},
		getInitialValueInEffect: false,
	});

	const treeController = useTree({
		initialExpandedState: persistedExpandedState,
		onNodeExpand: value =>
			setPersistedExpandedState(prev => ({ ...prev, [value]: true })),
		onNodeCollapse: value =>
			setPersistedExpandedState(prev => ({ ...prev, [value]: false })),
	});

	// Data loads after first render leading to initial expanded state not being applied.
	const restoredRef = useRef(false);
	useEffect(() => {
		if (!restoredRef.current && data.length > 0) {
			treeController.setExpandedState(persistedExpandedState);
			restoredRef.current = true;
		}
	}, [data, persistedExpandedState, treeController]);

	const [search, setSearch] = useState("");
	const preSearchExpandedState = useRef<Record<string, boolean> | null>(null);

	const filteredData = useMemo(
		() => (search.trim() ? filterTree(data, search) : data),
		[data, search],
	);

	function handleSearchChange(value: string) {
		setSearch(value);
		if (value.trim()) {
			preSearchExpandedState.current ??= persistedExpandedState;
			treeController.setExpandedState(
				getTreeExpandedState(filterTree(data, value), "*"),
			);
		} else {
			treeController.setExpandedState(
				preSearchExpandedState.current ?? {},
			);
			preSearchExpandedState.current = null;
		}
	}

	function ancestorsExpanded(id: string): Record<string, boolean> | null {
		const ancestors = getAncestorsOf(data, id) as string[] | null;
		return ancestors && Object.fromEntries(ancestors.map(a => [a, true]));
	}

	/** Clears the search and expands `id`'s ancestors; false when `id` isn't in the tree. */
	function reveal(id: string) {
		const extra = ancestorsExpanded(id);
		if (!extra) return false;
		const base = search.trim()
			? (preSearchExpandedState.current ?? {})
			: treeController.expandedState;
		setSearch("");
		preSearchExpandedState.current = null;
		setPersistedExpandedState(prev => ({ ...prev, ...extra }));
		treeController.setExpandedState({ ...base, ...extra });
		return true;
	}

	/** Expands `id`'s ancestors, keeping a search (they stay expanded once it's cleared); false when `id` isn't in the tree. */
	function expandTo(id: string) {
		const extra = ancestorsExpanded(id);
		if (!extra) return false;
		if (preSearchExpandedState.current)
			preSearchExpandedState.current = {
				...preSearchExpandedState.current,
				...extra,
			};
		setPersistedExpandedState(prev => ({ ...prev, ...extra }));
		treeController.setExpandedState({
			...treeController.expandedState,
			...extra,
		});
		return true;
	}

	return {
		treeController,
		filteredData,
		search,
		handleSearchChange,
		reveal,
		expandTo,
	};
}
