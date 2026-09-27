import { useMemo } from "react";
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
import useAppSelector from "../../../hooks/useAppSelector";
import { useElementParams } from "../../../hooks/useElementParams";
import { useTauriEvent } from "../../../hooks/useTauriEvent";
import { paths } from "../../../paths";
import { loadElementTree } from "../../../stores/elements/elementsActions";
import { selectStudyStatus } from "../../../stores/study/studySelectors";
import {
	dtosToTreeData,
	findNodeType,
	getAdjacentNodeValue,
} from "../utils/elementTreeUtils";
import { useElementTreeExpansion } from "./useElementTreeExpansion";

/**
 * The element tree's data and expansion. Kept above the sidebar's tabs, whose
 * hidden panels pause their effects, so the tree's shortcuts work from any tab.
 */
export function useElementTreeState(tree: NodeDto[]) {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const selected = useElementParams();
	const data = useMemo(() => dtosToTreeData(tree), [tree]);
	const isStudying = useAppSelector(selectStudyStatus) === "studying";
	const expansion = useElementTreeExpansion(
		data,
		selected?.id ?? null,
		isStudying,
	);
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

	useTauriEvent<ElementCreatedEventDto>(ELEMENT_CREATED_EVENT, payload => {
		void dispatch(loadElementTree());
		if (payload.parentId) treeController.expand(payload.parentId);
	});

	return { ...expansion, data, selected, openNode };
}

export type ElementTreeState = ReturnType<typeof useElementTreeState>;
