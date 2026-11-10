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

export function useElementTreeExpansion(
	data: TreeNodeData[],
	selectedId: string | null = null,
	isStudying = false,
) {
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

	// Ancestor ids that were auto-expanded to reveal the current study element but
	// were not expanded beforehand — collapsed again once study moves past them.
	const studyAutoExpandedRef = useRef<string[]>([]);
	const wasStudyingRef = useRef(isStudying);

	// Reveal the selected element by expanding its ancestors whenever navigation changes it.
	useEffect(() => {
		const sessionEnded = wasStudyingRef.current && !isStudying;
		wasStudyingRef.current = isStudying;

		// The last studied element stays selected, so collapse what study opened instead of revealing it.
		if (sessionEnded) {
			const collapsed = Object.fromEntries(
				studyAutoExpandedRef.current.map(id => [id, false]),
			);
			studyAutoExpandedRef.current = [];
			treeController.setExpandedState({
				...treeController.expandedState,
				...collapsed,
			});
			return;
		}

		if (!selectedId || data.length === 0) return;
		const ancestors = getAncestorsOf(data, selectedId) ?? [];

		if (isStudying) {
			const current = { ...treeController.expandedState };
			for (const id of studyAutoExpandedRef.current) {
				current[id] = false;
			}
			const newlyExpanded = ancestors.filter(id => !current[id]);
			for (const id of ancestors) {
				current[id] = true;
			}
			treeController.setExpandedState(current);
			studyAutoExpandedRef.current = newlyExpanded;
			return;
		}

		studyAutoExpandedRef.current = [];
		expandNodes(ancestors);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- The rest are not important.
	}, [selectedId, data, isStudying]);

	/** Expands `ids` at once, skipping the state updates when they already are. */
	function expandNodes(ids: string[]) {
		if (ids.every(id => treeController.expandedState[id])) return;
		const extra = Object.fromEntries(ids.map(id => [id, true]));
		setPersistedExpandedState(prev => ({ ...prev, ...extra }));
		treeController.setExpandedState({
			...treeController.expandedState,
			...extra,
		});
	}

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
			const restored = preSearchExpandedState.current ?? {};
			if (selectedId) {
				const ancestors = getAncestorsOf(data, selectedId) ?? [];
				const extra = Object.fromEntries(
					ancestors.map(id => [id, true]),
				);
				treeController.setExpandedState({ ...restored, ...extra });
			} else {
				treeController.setExpandedState(restored);
			}
			preSearchExpandedState.current = null;
		}
	}

	return {
		treeController,
		filteredData,
		search,
		handleSearchChange,
		expandNodes,
	};
}
