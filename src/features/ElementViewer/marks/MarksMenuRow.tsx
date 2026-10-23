import { KeyboardEvent, ReactNode } from "react";
import {
	Button,
	Center,
	createScopedKeydownHandler,
	Group,
	Stack,
	Text,
	useMenuContext,
} from "@mantine/core";
import { CommandId, commandsById } from "../../../commands/commands";
import { useRunCommand } from "../../../commands/useRunCommand";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { GoToMarkIcon, SetMarkIcon } from "../../../config/icons";
import {
	MARK_SLOTS,
	MarkSlot,
} from "../../../types/elements/learningAssetMark";
import {
	findMark,
	goToMarkLabel,
	MARK_COLORS,
	markFillColor,
	setMarkLabel,
} from "./markLogic";
import { useMarksContext } from "./marksContext";

const MARKS_ROW_SELECTOR = "[data-marks-row]";
const MENU_ITEM_SELECTOR = "[data-menu-item]:not([data-disabled])";

// Left/right moves within the marks row; up/down continues through the rest of the menu.
const moveWithinRow = createScopedKeydownHandler({
	parentSelector: MARKS_ROW_SELECTOR,
	siblingSelector: MENU_ITEM_SELECTOR,
	activateOnFocus: false,
	loop: true,
	orientation: "horizontal",
});
const moveThroughMenu = createScopedKeydownHandler({
	parentSelector: "[data-menu-dropdown]",
	siblingSelector: MENU_ITEM_SELECTOR,
	activateOnFocus: false,
	loop: true,
	orientation: "vertical",
});
function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
	if (event.key === "ArrowLeft" || event.key === "ArrowRight")
		moveWithinRow(event);
	else moveThroughMenu(event);
}

interface MarkButtonProps {
	/** Labels the button; `null` for the second half of an unset mark, which repeats the first and is skipped by keyboard and screen readers. */
	label: string | null;
	command: CommandId;
	children: ReactNode;
	rightSection?: ReactNode;
	variant: string;
	color: string;
	style?: React.CSSProperties;
	/** Shortcut shown in the button's own tooltip; an unset mark's halves share one tooltip instead. */
	shortcut?: string;
	withTooltip?: boolean;
}

/** One half of a mark's split button, navigable and closing the menu like a `Menu.Item`. */
function MarkButton({
	label,
	command,
	children,
	rightSection,
	variant,
	color,
	style,
	shortcut,
	withTooltip = false,
}: MarkButtonProps) {
	const runCommand = useRunCommand();
	const menu = useMenuContext();

	const button = (
		<Button
			size="compact-sm"
			radius="xl"
			variant={variant}
			color={color}
			rightSection={rightSection}
			styles={{ section: { marginInlineStart: 4 } }}
			aria-label={label ?? undefined}
			aria-hidden={label === null ? true : undefined}
			data-menu-item={label === null ? undefined : true}
			tabIndex={-1}
			style={style}
			onMouseDown={event => event.preventDefault()}
			onKeyDown={handleKeyDown}
			onClick={() => {
				runCommand(command);
				if (menu.closeOnItemClick !== false) menu.closeDropdown();
			}}>
			{children}
		</Button>
	);
	return withTooltip && label !== null ? (
		<AppTooltip label={label} shortcut={shortcut}>
			{button}
		</AppTooltip>
	) : (
		button
	);
}

/**
 * A set mark splits into going to it and moving it. An unset one keeps the same two halves, so it's as wide,
 * but both set it under one tooltip.
 */
function MarkSplitButton({ slot }: { slot: MarkSlot }) {
	const { marks, progressOf } = useMarksContext();
	const mark = findMark(marks, slot);
	const progress = mark ? progressOf(mark.anchor) : null;
	const color = MARK_COLORS[slot];
	const outline = `1px solid var(--mantine-color-${color}-outline)`;
	const setLabel = setMarkLabel(slot, progress);
	const setShortcut = commandsById[`set-mark-${slot}`].shortcut;
	const setCommand: CommandId = `set-mark-${slot}`;
	const arrow = <GoToMarkIcon size={14} />;

	if (mark) {
		return (
			<Button.Group aria-label={`Mark ${slot}`}>
				<MarkButton
					label={goToMarkLabel(slot, true, progress)}
					shortcut={commandsById[`go-to-mark-${slot}`].shortcut}
					withTooltip
					command={`go-to-mark-${slot}`}
					variant="filled"
					color={markFillColor(slot)}
					rightSection={arrow}
					// A full-width seam, matching the divider an unset mark draws there.
					style={{ borderInlineEndWidth: 1 }}>
					{slot}
				</MarkButton>
				<MarkButton
					label={setLabel}
					shortcut={setShortcut}
					withTooltip
					command={setCommand}
					variant="light"
					color={color}
					style={{ border: outline, borderInlineStart: 0 }}>
					<SetMarkIcon weight="fill" />
				</MarkButton>
			</Button.Group>
		);
	}

	return (
		<AppTooltip label={setLabel} shortcut={setShortcut}>
			<Button.Group aria-label={`Mark ${slot}`}>
				<MarkButton
					label={setLabel}
					command={setCommand}
					variant="light"
					color={color}
					// Holds the room a set mark's go-to arrow takes.
					rightSection={
						<span style={{ visibility: "hidden", display: "flex" }}>
							{arrow}
						</span>
					}
					style={{ border: outline, borderInlineEnd: 0 }}>
					{/* Sizes the half like a set mark's; the visible number is centered over it. */}
					<span style={{ visibility: "hidden" }}>{slot}</span>
					<Center pos="absolute" inset={0}>
						{slot}
					</Center>
				</MarkButton>
				<MarkButton
					label={null}
					command={setCommand}
					variant="light"
					color={color}
					style={{ border: outline }}>
					<SetMarkIcon />
				</MarkButton>
			</Button.Group>
		</AppTooltip>
	);
}

/** The three mark slots, shown above the read point items in a learning asset's right-click menu. */
export default function MarksMenuRow() {
	return (
		<Stack gap="xs" px="sm" pt={4} pb="xs">
			<div>
				<Text size="sm" fw={600}>
					Marks
				</Text>
				<Text size="xs" c="dimmed">
					Save up to {MARK_SLOTS.length} spots to jump back to
				</Text>
			</div>
			<Group gap="sm" wrap="nowrap" data-marks-row>
				{MARK_SLOTS.map(slot => (
					<MarkSplitButton key={slot} slot={slot} />
				))}
			</Group>
		</Stack>
	);
}
