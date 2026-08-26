import {
	Menu,
	RenderTreeNodePayload,
	Stack,
	TextInput,
	Tree,
} from "@mantine/core";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { MoveElementDto } from "../../../../api/elements/api/elementsApi";
import { NodeDto } from "../../../../api/elements/dto/nodeDto";
import {
	ELEMENT_CREATED_EVENT,
	ElementCreatedEventDto,
} from "../../../../api/elements/events/elementCreatedEvent";
import { useElementParams } from "../../../../hooks/useElementParams";
import { useIsCoarsePointer } from "../../../../hooks/useIsCoarsePointer";
import { useTauriEvent } from "../../../../hooks/useTauriEvent";
import { paths } from "../../../../paths";
import { ElementId } from "../../../../types/elements/elementId";
import { ElementNodeType } from "../../../../types/elements/elementNodeType";
import {
	dtosToTreeData,
	ElementNodeProps,
	findNodeType,
} from "../../utils/elementTreeUtils";
import { useElementTreeExpansion } from "../../hooks/useElementTreeExpansion";
import TrashElementModal from "../TrashElementModal";
import ElementTreeMenuItems from "./ElementTreeMenuItems";
import ElementTreeNode from "./ElementTreeNode";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import {
	loadElementTree,
	moveElementAction,
} from "../../../../stores/elements/elementsActions";

interface ElementTreeProps {
	tree: NodeDto[];
}

function ElementTree({ tree }: ElementTreeProps) {
	const navigate = useNavigate();
	const selected = useElementParams();
	const coarsePointer = useIsCoarsePointer();
	const data = useMemo(() => dtosToTreeData(tree), [tree]);
	const dispatch = useAppDispatch();
	const [contextMenuNode, setContextMenuNode] = useState<{
		value: string;
		type: ElementNodeType;
	} | null>(null);
	const [trashTarget, setTrashTarget] = useState<ElementId | null>(null);
	const [renamingTarget, setRenamingTarget] = useState<ElementId | null>(
		null,
	);

	const { treeController, filteredData, search, handleSearchChange } =
		useElementTreeExpansion(data, selected?.id ?? null);

	useTauriEvent<ElementCreatedEventDto>(ELEMENT_CREATED_EVENT, payload => {
		void dispatch(loadElementTree());
		if (payload.parentId) treeController.expand(payload.parentId);
	});

	function renderNode(payload: RenderTreeNodePayload) {
		const { node } = payload;
		const { type } = node.nodeProps as ElementNodeProps;
		const isSelected =
			selected?.id === node.value && selected?.type === type;

		const isRenaming =
			renamingTarget?.id === node.value && renamingTarget?.type === type;

		return (
			<ElementTreeNode
				payload={payload}
				search={search}
				isSelected={isSelected}
				isContextMenuOpen={
					contextMenuNode?.value === node.value &&
					contextMenuNode?.type === type
				}
				isRenaming={isRenaming}
				onSelect={() => void navigate(paths.element(type, node.value))}
				onContextMenu={() => {
					// The context menu itself is disabled for coarse (touch)
					// pointers, so it would never open to clear this again.
					if (coarsePointer) return;
					setContextMenuNode({ value: node.value, type });
				}}
				onRenameClick={() =>
					setRenamingTarget({ type, id: node.value })
				}
				onRenameClose={() => setRenamingTarget(null)}
				onAfterCreate={() => treeController.expand(node.value)}
			/>
		);
	}

	const treeElement = (
		<Tree
			data={filteredData}
			tree={treeController}
			renderNode={renderNode}
			withLines
			onDragDrop={({ draggedNode, targetNode, position }) => {
				const draggedType = findNodeType(data, draggedNode);
				const targetType = findNodeType(data, targetNode);
				if (!draggedType) return;
				const dto: MoveElementDto = {
					draggedId: {
						type: draggedType,
						id: draggedNode,
					},
					targetId: targetType
						? { type: targetType, id: targetNode }
						: null,
					position,
				};
				void dispatch(moveElementAction(dto));
			}}
		/>
	);

	return (
		<Stack gap="xs">
			<TextInput
				placeholder="Search..."
				leftSection={<MagnifyingGlassIcon size={16} />}
				value={search}
				onChange={e => handleSearchChange(e.currentTarget.value)}
			/>
			<Menu
				withinPortal
				onClose={() => setContextMenuNode(null)}
				shadow="lg">
				{/* On coarse (touch) pointers, long-pressing to drag-reorder a node
				also satisfies the browser's long-press gesture for opening a
				context menu. Touch users already have an explicit "..." button per
				node, so the context menu itself is disabled for touch input. */}
				<Menu.ContextMenu disabled={coarsePointer}>
					{treeElement}
				</Menu.ContextMenu>
				<Menu.Dropdown>
					{contextMenuNode && (
						<ElementTreeMenuItems
							elementId={{
								type: contextMenuNode.type,
								id: contextMenuNode.value,
							}}
							onRenameClick={() =>
								setRenamingTarget({
									type: contextMenuNode.type,
									id: contextMenuNode.value,
								})
							}
							onTrashClick={() =>
								setTrashTarget({
									type: contextMenuNode.type,
									id: contextMenuNode.value,
								})
							}
							onAfterCreate={() =>
								treeController.expand(contextMenuNode.value)
							}
						/>
					)}
				</Menu.Dropdown>
			</Menu>
			<TrashElementModal
				elementId={trashTarget}
				onClose={() => setTrashTarget(null)}
			/>
		</Stack>
	);
}

export default ElementTree;
