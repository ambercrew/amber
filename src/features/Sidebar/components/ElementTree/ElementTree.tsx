import {
	Menu,
	RenderTreeNodePayload,
	Stack,
	TextInput,
	Tree,
} from "@mantine/core";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MoveElementDto } from "../../../../api/elements/api/elementsApi";
import { useIsCoarsePointer } from "../../../../hooks/useIsCoarsePointer";
import { paths } from "../../../../paths";
import { ElementId } from "../../../../types/elements/elementId";
import { ElementNodeType } from "../../../../types/elements/elementNodeType";
import { ElementNodeProps, findNodeType } from "../../utils/elementTreeUtils";
import TrashElementModal from "../TrashElementModal";
import ElementTreeMenuItems from "./ElementTreeMenuItems";
import ElementTreeNode from "./ElementTreeNode";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { moveElementAction } from "../../../../stores/elements/elementsActions";
import { useFocusOnRequest } from "../../../../hooks/useFocusRequest";
import { matchesShortcut } from "../../../../commands/useAppHotkeys";
import {
	GO_BACK_SHORTCUT,
	GO_FORWARD_SHORTCUT,
	NEXT_TREE_ELEMENT_SHORTCUT,
	OPEN_FOCUSED_TREE_ELEMENT_SHORTCUT,
	PREVIOUS_TREE_ELEMENT_SHORTCUT,
} from "../../../../config/shortcuts";
import { ElementTreeState } from "../../hooks/useElementTreeState";

// Mantine's tree nodes act on arrow keys whatever the modifiers, and stop them.
const PASS_THROUGH_SHORTCUTS = [
	GO_BACK_SHORTCUT,
	GO_FORWARD_SHORTCUT,
	NEXT_TREE_ELEMENT_SHORTCUT,
	PREVIOUS_TREE_ELEMENT_SHORTCUT,
];

interface ElementTreeProps {
	state: ElementTreeState;
}

function ElementTree({ state }: ElementTreeProps) {
	const navigate = useNavigate();
	const coarsePointer = useIsCoarsePointer();
	const dispatch = useAppDispatch();
	const [contextMenuNode, setContextMenuNode] = useState<{
		value: string;
		type: ElementNodeType;
	} | null>(null);
	const [trashTarget, setTrashTarget] = useState<ElementId | null>(null);
	const [renamingTarget, setRenamingTarget] = useState<ElementId | null>(
		null,
	);

	const {
		data,
		selected,
		openNode,
		treeController,
		filteredData,
		search,
		handleSearchChange,
	} = state;

	const containerRef = useRef<HTMLDivElement>(null);
	useFocusOnRequest("tree", () => {
		const items =
			containerRef.current?.querySelectorAll<HTMLElement>(
				"[role=treeitem]",
			);
		const target =
			Array.from(items ?? []).find(
				item => item.dataset.value === selected?.id,
			) ?? items?.[0];
		target?.setAttribute("data-focus-ring", "true");
		target?.focus();
	});

	// Hand app shortcuts on tree items to the app's hotkeys, before Mantine's nodes swallow them.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const passThrough = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			if (target.getAttribute("role") !== "treeitem") return;
			if (!PASS_THROUGH_SHORTCUTS.some(s => matchesShortcut(s, event)))
				return;
			event.stopPropagation();
			event.preventDefault();
			document.documentElement.dispatchEvent(
				new KeyboardEvent("keydown", event),
			);
		};
		container.addEventListener("keydown", passThrough, { capture: true });
		return () =>
			container.removeEventListener("keydown", passThrough, {
				capture: true,
			});
	}, []);

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
			onKeyDown={event => {
				// Mantine's tree moves focus with the arrows; this opens the focused element.
				const target = event.target as HTMLElement;
				if (
					!matchesShortcut(
						OPEN_FOCUSED_TREE_ELEMENT_SHORTCUT,
						event.nativeEvent,
					) ||
					target.getAttribute("role") !== "treeitem"
				)
					return;
				event.preventDefault();
				if (target.dataset.value) openNode(target.dataset.value);
			}}
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
		<Stack gap="xs" ref={containerRef}>
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
