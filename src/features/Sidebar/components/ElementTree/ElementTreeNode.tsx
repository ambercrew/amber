import {
	ActionIcon,
	Box,
	Group,
	Highlight,
	Menu,
	RenderTreeNodePayload,
} from "@mantine/core";
import { DotsThreeVerticalIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import CountBadge from "../../../../components/CountBadge/CountBadge";
import ElementNodeIcon from "../../../../components/ElementNodeIcon/ElementNodeIcon";
import { ElementNodeProps } from "../../utils/elementTreeUtils";
import ElementTreeMenuItems from "./ElementTreeMenuItems";
import RenameElementForm from "./RenameElementForm";
import AppTooltip from "../../../../components/AppTooltip/AppTooltip";
import { indentedRowStyle } from "../../../../components/VirtualTree/indentedRowStyle";
import DisclosureCaret from "../../../../components/DisclosureCaret/DisclosureCaret";

const ICON_SIZE = 18;

interface ElementTreeNodeProps {
	payload: RenderTreeNodePayload;
	search: string;
	isSelected: boolean;
	/** True when the open element is below this one. */
	isSelectedAncestor: boolean;
	isContextMenuOpen: boolean;
	isRenaming: boolean;
	/** Read once by the tree, as a media query per row slows scrolling. */
	coarsePointer: boolean;
	onSelect: () => void;
	onContextMenu: () => void;
	onRenameClick: () => void;
	onRenameClose: () => void;
	onTrashClick: () => void;
	onAfterCreate: () => void;
}

function ElementTreeNode({
	payload,
	search,
	isSelected,
	isSelectedAncestor,
	isContextMenuOpen,
	isRenaming,
	coarsePointer,
	onSelect,
	onContextMenu,
	onRenameClick,
	onRenameClose,
	onTrashClick,
	onAfterCreate,
}: ElementTreeNodeProps) {
	const { node, level, expanded, elementProps } = payload;
	const { type, childrenCount } = node.nodeProps as ElementNodeProps;
	const id = node.value;
	const label = typeof node.label === "string" ? node.label : node.value;
	const [isHovered, setIsHovered] = useState(false);
	const labelRef = useRef<HTMLDivElement>(null);
	// Only controls the menu with three dots.
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const { onClick: toggleExpanded, ...restElementProps } = elementProps;
	// There is no hover with a coarse (touch) pointer, so the menu has to stay visible.
	const showMenuButton =
		coarsePointer || isHovered || isMenuOpen || isContextMenuOpen;
	const countBadge = childrenCount > 0 && (
		<CountBadge
			count={childrenCount}
			aria-hidden
			style={{ pointerEvents: "none" }}
		/>
	);

	function handleCaretClick(e: React.MouseEvent) {
		e.stopPropagation();
		toggleExpanded?.(e as React.MouseEvent<HTMLElement>);
	}

	return (
		<Group
			gap={6}
			py={2}
			pr={4}
			{...restElementProps}
			draggable
			onClick={onSelect}
			onDoubleClick={onRenameClick}
			onContextMenu={onContextMenu}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			bg={
				isSelected
					? "var(--selected-row-bg)"
					: isMenuOpen || isContextMenuOpen || isHovered
						? "var(--mantine-color-gray-light-hover)"
						: undefined
			}
			c={
				isSelected
					? "var(--selected-row-color)"
					: isSelectedAncestor
						? "var(--primary-text-color)"
						: undefined
			}
			data-active={isSelected || isSelectedAncestor || undefined}
			style={{
				...indentedRowStyle(level),
				borderRadius: "var(--mantine-radius-default)",
			}}>
			<ActionIcon
				variant="transparent"
				size="xs"
				c="inherit"
				aria-label={expanded ? "Collapse" : "Expand"}
				onClick={handleCaretClick}>
				<DisclosureCaret opened={expanded} size={ICON_SIZE} />
			</ActionIcon>
			<ElementNodeIcon type={type} expanded={expanded} size={ICON_SIZE} />
			{isRenaming ? (
				<RenameElementForm
					elementId={{ type, id }}
					initialName={label}
					onClose={onRenameClose}
				/>
			) : (
				<>
					<Highlight
						ref={labelRef}
						highlight={search}
						flex={1}
						truncate="end"
						aria-label={label}>
						{label}
					</Highlight>
					{/* Mounted beside the name, and only on the hovered row: one per row made scrolling slow. */}
					{isHovered && (
						<AppTooltip label={label} target={labelRef} />
					)}
				</>
			)}
			{coarsePointer && countBadge}
			{/* The badge and the menu button share one cell, so hovering swaps them without moving anything. */}
			<Box
				display="grid"
				style={{
					flexShrink: 0,
					justifyItems: "end",
					alignItems: "center",
				}}>
				{!coarsePointer && (
					<Box
						display="flex"
						style={{
							gridArea: "1 / 1",
							visibility: showMenuButton ? "hidden" : "visible",
						}}>
						{countBadge}
					</Box>
				)}
				{/* Flex, not block: a block wrapper adds line-box space below the button, so it sat high. */}
				<Box display="flex" style={{ gridArea: "1 / 1" }}>
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
									visibility: showMenuButton
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
								onTrashClick={onTrashClick}
								onAfterCreate={onAfterCreate}
							/>
						</Menu.Dropdown>
					</Menu>
				</Box>
			</Box>
		</Group>
	);
}

export default ElementTreeNode;
