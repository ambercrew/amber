import {
	ActionIcon,
	Group,
	Highlight,
	Menu,
	RenderTreeNodePayload,
} from "@mantine/core";
import {
	CaretDownIcon,
	CaretRightIcon,
	DotsThreeVerticalIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import ElementNodeIcon from "../../../App/components/ElementNodeIcon";
import { useIsCoarsePointer } from "../../../../hooks/useIsCoarsePointer";
import { ElementId } from "../../../../types/elements/elementId";
import { ElementNodeProps } from "../../utils/elementTreeUtils";
import TrashElementModal from "../TrashElementModal";
import ElementTreeMenuItems from "./ElementTreeMenuItems";
import RenameElementForm from "./RenameElementForm";
import AppTooltip from "../../../../components/AppTooltip/AppTooltip";

const ICON_SIZE = 18;

interface ElementTreeNodeProps {
	payload: RenderTreeNodePayload;
	search: string;
	isSelected: boolean;
	isContextMenuOpen: boolean;
	isRenaming: boolean;
	onSelect: () => void;
	onContextMenu: () => void;
	onRenameClick: () => void;
	onRenameClose: () => void;
	onAfterCreate: () => void;
}

function ElementTreeNode({
	payload,
	search,
	isSelected,
	isContextMenuOpen,
	isRenaming,
	onSelect,
	onContextMenu,
	onRenameClick,
	onRenameClose,
	onAfterCreate,
}: ElementTreeNodeProps) {
	const { node, expanded, elementProps } = payload;
	const { type, childrenCount } = node.nodeProps as ElementNodeProps;
	const id = node.value;
	const label = typeof node.label === "string" ? node.label : node.value;
	const [isHovered, setIsHovered] = useState(false);
	const coarsePointer = useIsCoarsePointer();
	// Only controls the menu with three dots.
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [trashTarget, setTrashTarget] = useState<ElementId | null>(null);

	const { onClick: toggleExpanded, ...restElementProps } = elementProps;

	function handleCaretClick(e: React.MouseEvent) {
		e.stopPropagation();
		toggleExpanded?.(e as React.MouseEvent<HTMLElement>);
	}

	return (
		<>
			<Group
				gap={6}
				py={2}
				{...restElementProps}
				onClick={onSelect}
				onDoubleClick={onRenameClick}
				onContextMenu={onContextMenu}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				bg={
					isSelected
						? "var(--mantine-primary-color-light)"
						: isMenuOpen || isContextMenuOpen || isHovered
							? "var(--mantine-color-gray-light-hover)"
							: undefined
				}
				c={
					isSelected
						? "var(--mantine-primary-color-light-color)"
						: undefined
				}
				style={{ borderRadius: "var(--mantine-radius-default)" }}>
				<ActionIcon
					variant="transparent"
					size="xs"
					c="inherit"
					aria-label={expanded ? "Collapse" : "Expand"}
					onClick={handleCaretClick}>
					{expanded ? (
						<CaretDownIcon size={ICON_SIZE} />
					) : (
						<CaretRightIcon size={ICON_SIZE} />
					)}
				</ActionIcon>
				<ElementNodeIcon
					type={type}
					expanded={expanded}
					size={ICON_SIZE}
				/>
				{isRenaming ? (
					<RenameElementForm
						elementId={{ type, id }}
						initialName={label}
						onClose={onRenameClose}
					/>
				) : (
					<AppTooltip label={label} openDelay={500}>
						<Highlight
							highlight={search}
							flex={1}
							truncate="end"
							aria-label={label}>
							{`${label} (${childrenCount})`}
						</Highlight>
					</AppTooltip>
				)}
				<Menu
					withinPortal
					position="bottom-start"
					onOpen={() => setIsMenuOpen(true)}
					onClose={() => setIsMenuOpen(false)}
					shadow="lg">
					<Menu.Target>
						<ActionIcon
							variant="subtle"
							aria-label="Open actions menu"
							style={{
								// There is no hover with a coarse (touch)
								// pointer, so the menu has to stay visible.
								visibility:
									coarsePointer ||
									isHovered ||
									isMenuOpen ||
									isContextMenuOpen
										? "visible"
										: "hidden",
							}}
							onClick={e => e.stopPropagation()}>
							<DotsThreeVerticalIcon
								size={ICON_SIZE}
								weight="bold"
							/>
						</ActionIcon>
					</Menu.Target>
					{/* React events bubble out of the portal into the row, so
					    without this every menu click would also select the
					    element — and selecting closes the sidebar on mobile. */}
					<Menu.Dropdown onClick={e => e.stopPropagation()}>
						<ElementTreeMenuItems
							elementId={{ type, id }}
							onRenameClick={onRenameClick}
							onTrashClick={() => setTrashTarget({ type, id })}
							onAfterCreate={onAfterCreate}
						/>
					</Menu.Dropdown>
				</Menu>
			</Group>
			<TrashElementModal
				elementId={trashTarget}
				onClose={() => setTrashTarget(null)}
			/>
		</>
	);
}

export default ElementTreeNode;
