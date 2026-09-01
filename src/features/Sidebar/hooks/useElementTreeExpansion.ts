import {
	filterTreeData,
	getTreeExpandedState,
	TreeNodeData,
	useTree,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAncestorsOf } from "../utils/elementTreeUtils";

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

	// Reveal the selected element by expanding its ancestors whenever navigation changes it.
	useEffect(() => {
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
		if (ancestors.length === 0) return;
		const extra = Object.fromEntries(ancestors.map(id => [id, true]));
		setPersistedExpandedState(prev => ({ ...prev, ...extra }));
		treeController.setExpandedState({
			...treeController.expandedState,
			...extra,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps -- The rest are not important.
	}, [selectedId, data, isStudying]);

	const [search, setSearch] = useState("");
	const preSearchExpandedState = useRef<Record<string, boolean> | null>(null);

	const filteredData = useMemo(
		() => (search.trim() ? filterTreeData(data, search) : data),
		[data, search],
	);

	function handleSearchChange(value: string) {
		setSearch(value);
		if (value.trim()) {
			preSearchExpandedState.current ??= persistedExpandedState;
			const filtered = filterTreeData(data, value);
			treeController.setExpandedState(
				getTreeExpandedState(filtered, "*"),
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

	return { treeController, filteredData, search, handleSearchChange };
}
