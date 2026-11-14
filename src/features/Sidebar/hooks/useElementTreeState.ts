import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { NodeDto } from "../../../api/elements/dto/nodeDto";
import {
	ELEMENT_CREATED_EVENT,
	ElementCreatedEventDto,
} from "../../../api/elements/events/elementCreatedEvent";
import { useAppHotkeys } from "../../../commands/useAppHotkeys";
import {
	NEXT_TREE_ELEMENT_SHORTCUT,
	PREVIOUS_TREE_ELEMENT_SHORTCUT,
} from "../../../config/shortcuts";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { useElementParams } from "../../../hooks/useElementParams";
import { useTauriEvent } from "../../../hooks/useTauriEvent";
import { paths } from "../../../paths";
import { addCreatedElementsAction } from "../../../stores/elements/elementsActions";
import {
	dtosToTreeData,
	findNodeType,
	getAdjacentNodeValue,
} from "../utils/elementTreeUtils";
import { useElementTreeExpansion } from "./useElementTreeExpansion";

/** A big import creates elements by the thousand; this groups them into few tree updates. */
const CREATED_BATCH_DELAY_MS = 50;

/**
 * The element tree's data and expansion. Kept above the sidebar's tabs, whose
 * hidden panels pause their effects, so the tree's shortcuts work from any tab.
 */
export function useElementTreeState(tree: NodeDto[]) {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const selected = useElementParams();
	const data = useMemo(() => dtosToTreeData(tree), [tree]);
	const expansion = useElementTreeExpansion(data);
	const { treeController, filteredData } = expansion;

	function openNode(value: string) {
		const type = findNodeType(data, value);
		if (type) void navigate(paths.element(type, value));
	}

	function openAdjacent(offset: 1 | -1) {
		const next = getAdjacentNodeValue(
			filteredData,
			treeController.expandedState,
			selected?.id ?? null,
			offset,
		);
		if (next) openNode(next);
	}

	useAppHotkeys([
		[NEXT_TREE_ELEMENT_SHORTCUT, () => openAdjacent(1)],
		[PREVIOUS_TREE_ELEMENT_SHORTCUT, () => openAdjacent(-1)],
	]);

	const createdBatch = useRef<ElementCreatedEventDto[]>([]);
	const batchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

	function takeCreatedBatch() {
		const created = createdBatch.current;
		createdBatch.current = [];
		clearTimeout(batchTimeout.current);
		batchTimeout.current = undefined;
		return created;
	}

	// Leaves the parents collapsed: extracts and cards are made while reading, away from the tree.
	function addCreatedBatch() {
		void dispatch(addCreatedElementsAction(takeCreatedBatch()));
	}

	useTauriEvent<ElementCreatedEventDto>(ELEMENT_CREATED_EVENT, payload => {
		createdBatch.current.push(payload);
		batchTimeout.current ??= setTimeout(
			addCreatedBatch,
			CREATED_BATCH_DELAY_MS,
		);
	});

	useEffect(
		() => () => {
			const created = takeCreatedBatch();
			if (created.length > 0)
				void dispatch(addCreatedElementsAction(created));
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- Only reads refs and the stable dispatch.
		[],
	);

	return { ...expansion, data, selected, openNode };
}

export type ElementTreeState = ReturnType<typeof useElementTreeState>;
