import { CSSProperties, ReactNode, useState } from "react";
import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Center,
	Divider,
	Group,
	Menu,
	Popover,
	SegmentedControl,
	Stack,
	Switch,
	Text,
	VisuallyHidden,
} from "@mantine/core";
import { spotlight } from "@mantine/spotlight";
import {
	ArrowsHorizontalIcon,
	ArrowsInLineHorizontalIcon,
	ArrowsOutLineHorizontalIcon,
	CommandIcon,
	EraserIcon,
	GearIcon,
	Icon,
	KeyboardIcon,
	MagnifyingGlassIcon,
	MinusIcon,
	PlusIcon,
	TextAlignLeftIcon,
} from "@phosphor-icons/react";
import {
	QuickSettingsIcon,
	GoToIcon,
	MarkIcon,
	ReadPointIcon,
} from "../../../config/icons";
import {
	OPEN_SETTINGS_SHORTCUT,
	RESET_ZOOM_SHORTCUT,
	SPOTLIGHT_SHORTCUT,
	ZOOM_IN_SHORTCUT,
	ZOOM_OUT_SHORTCUT,
} from "../../../config/shortcuts";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { CommandId, commandsById } from "../../../commands/commands";
import { useRunCommand } from "../../../commands/useRunCommand";
import { useShortcutDisplay } from "../../../commands/useShortcutDisplay";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	useHasTouchScreen,
	useIsCoarsePointer,
} from "../../../hooks/useIsCoarsePointer";
import {
	selectIsHeaderPinned,
	selectIsVirtualKeyboardSuppressed,
	selectMarkSlots,
	selectReadPointSource,
} from "../../../stores/app/appSelectors";
import { selectCanZoomAppWide } from "../../../stores/elements/elementsSelectors";
import { selectSettings } from "../../../stores/settings/settingsSelectors";
import { saveSettings } from "../../../stores/settings/settingsActions";
import { buildUpdateSettingsRequest } from "../../../api/settings/dto/updateSettingsRequestDto";
import { ReadPointSource } from "../../../types/elements/readPointSource";
import { MARK_SLOTS } from "../../../types/elements/learningAssetMark";
import { LineWidth } from "../../../api/settings/dto/settingsDto";
import { useIsSmallScreen } from "../../../hooks/useIsSmallScreen";
import { isMobile } from "../../../utils/tauriUtils";
import { ZOOM_MAX, ZOOM_MIN } from "../../../utils/zoom";

const LABEL = "Quick settings";
const ICON_SIZE = 18;

const SOURCE_LABELS: Record<
	ReadPointSource,
	{ name: string; description: string }
> = {
	automatic: { name: "Auto", description: "Follows your scrolling." },
	extract: {
		name: "Extract",
		description: "Moves with your extracts and clozes.",
	},
	lookup: {
		name: "Kept",
		description: "Opened at a spot, so it moves only when you set it.",
	},
	manual: { name: "Manual", description: "Moves only when you set it." },
};

// The read point's actions, run through their commands so they match the shortcuts and the palette.
const READ_POINT_ACTIONS = [
	{
		id: "set-read-point",
		label: "Set the read point here",
		Icon: ReadPointIcon,
	},
	{ id: "go-to-read-point", label: "Go to the read point", Icon: GoToIcon },
	{ id: "clear-read-point", label: "Clear the read point", Icon: EraserIcon },
] as const;

const LINE_WIDTHS: { value: LineWidth; tooltip: string; Icon: Icon }[] = [
	{
		value: "Narrow",
		tooltip: "Narrow lines, easiest to read",
		Icon: ArrowsInLineHorizontalIcon,
	},
	{ value: "Medium", tooltip: "Medium lines", Icon: ArrowsHorizontalIcon },
	{
		value: "Wide",
		tooltip: "Wide lines, fitting the most on screen",
		Icon: ArrowsOutLineHorizontalIcon,
	},
];

// Mantine drops a disabled button's border, which would break a joined group's outline.
const DISABLED_JOINED_STYLE: CSSProperties = {
	borderColor: "var(--mantine-color-default-border)",
	background: "transparent",
};

/** Controls sized for the pointer: 44px targets for a finger, so a tap can't land on a neighbor. */
function useControlSizes() {
	return useIsCoarsePointer()
		? {
				icon: "xl",
				choice: "md",
				switch: "lg",
				button: "md",
				zoomLabel: 60,
			}
		: {
				icon: "lg",
				choice: "sm",
				switch: "md",
				button: "sm",
				zoomLabel: 56,
			};
}

/** The header's quick settings: what a reader changes or does often, and the way to every command and setting. */
export default function QuickSettings() {
	const [opened, setOpened] = useState(false);
	// Closes as the header scrolls away, so the card doesn't float over the text without its button.
	const headerPinned = useAppSelector(selectIsHeaderPinned);
	const [wasHeaderPinned, setWasHeaderPinned] = useState(headerPinned);
	if (headerPinned !== wasHeaderPinned) {
		setWasHeaderPinned(headerPinned);
		if (!headerPinned) setOpened(false);
	}

	return (
		<Popover
			opened={opened}
			onChange={setOpened}
			width="min(340px, calc(100vw - 1rem))"
			shadow="md"
			position="bottom-end">
			<Popover.Target>
				{/* Hidden while open, so it doesn't cover the card. */}
				<AppTooltip label={LABEL} disabled={opened}>
					<ActionIcon
						variant={opened ? "light" : "subtle"}
						size="lg"
						aria-label={LABEL}
						onClick={() => setOpened(o => !o)}>
						<QuickSettingsIcon size={ICON_SIZE} />
					</ActionIcon>
				</AppTooltip>
			</Popover.Target>
			<Popover.Dropdown>
				<QuickSettingsPanel onClose={() => setOpened(false)} />
			</Popover.Dropdown>
		</Popover>
	);
}

interface QuickSettingsPanelProps {
	/** Closes the card, before opening the command palette or Settings over it. */
	onClose: () => void;
}

/** The card's contents: where you are in the text, then how the page shows, then the ways out to commands and Settings. */
export function QuickSettingsPanel({ onClose }: QuickSettingsPanelProps) {
	// Where the marks' menus render: inside the card, so picking an item isn't a click outside that closes it.
	const [menuContainer, setMenuContainer] = useState<HTMLDivElement | null>(
		null,
	);

	return (
		<Stack gap="sm" ref={setMenuContainer}>
			<ReadPointRow />
			<MarksRow menuContainer={menuContainer} />
			<Divider />
			<ZoomRow />
			<LineWidthRow />
			<KeyboardRow />
			<Divider />
			<PanelFooter onClose={onClose} />
		</Stack>
	);
}

interface SettingRowProps {
	icon: ReactNode;
	label: string;
	/** Beside the label, e.g. the read point's source. */
	badge?: ReactNode;
	/** Explains the row, or why it's disabled, on hover or tap of its icon and label. */
	tooltip?: string;
	disabled?: boolean;
	children?: ReactNode;
}

function SettingRow({
	icon,
	label,
	badge,
	tooltip,
	disabled = false,
	children,
}: SettingRowProps) {
	// Only the label gives way in a tight row; the icon and controls keep their size.
	const heading = (
		<Group gap="xs" wrap="nowrap" miw={0}>
			<Box
				c={disabled ? "dimmed" : undefined}
				style={{ flexShrink: 0, display: "flex" }}>
				{icon}
			</Box>
			<Group gap={6} wrap="nowrap" miw={0}>
				<Text size="sm" c={disabled ? "dimmed" : undefined}>
					{label}
				</Text>
				{badge}
			</Group>
		</Group>
	);

	return (
		<Group justify="space-between" wrap="nowrap" gap="xs">
			{tooltip ? (
				<AppTooltip
					touch
					multiline
					maw="min(15rem, calc(100vw - 2rem))"
					label={tooltip}>
					{heading}
				</AppTooltip>
			) : (
				heading
			)}
			{children && <Box style={{ flexShrink: 0 }}>{children}</Box>}
		</Group>
	);
}

interface JoinedButtonProps {
	label: string;
	shortcut?: string;
	disabled: boolean;
	onClick: () => void;
	/** Wider than square, for a label such as the zoom percentage. */
	wide?: boolean;
	children: ReactNode;
}

/** One button of an `ActionIcon.Group`, outlined even while disabled. */
function JoinedButton({
	label,
	shortcut,
	disabled,
	onClick,
	wide = false,
	children,
}: JoinedButtonProps) {
	const sizes = useControlSizes();

	return (
		<AppTooltip label={label} shortcut={shortcut}>
			<ActionIcon
				variant="default"
				size={sizes.icon}
				aria-label={label}
				disabled={disabled}
				w={wide ? sizes.zoomLabel : undefined}
				style={disabled ? DISABLED_JOINED_STYLE : undefined}
				onClick={onClick}>
				{children}
			</ActionIcon>
		</AppTooltip>
	);
}

function ReadPointRow() {
	const source = useAppSelector(selectReadPointSource);
	const runCommand = useRunCommand();

	return (
		<SettingRow
			icon={<ReadPointIcon size={ICON_SIZE} />}
			label="Read point"
			badge={
				source && (
					<Badge variant="outline" size="sm" tt="none">
						{SOURCE_LABELS[source].name}
					</Badge>
				)
			}
			tooltip={
				source
					? SOURCE_LABELS[source].description
					: "Open a learning asset to use its read point."
			}
			disabled={!source}>
			<ActionIcon.Group>
				{READ_POINT_ACTIONS.map(({ id, label, Icon }) => (
					<JoinedButton
						key={id}
						label={label}
						shortcut={commandsById[id].shortcut}
						disabled={!source}
						onClick={() => runCommand(id)}>
						<Icon size={16} />
					</JoinedButton>
				))}
			</ActionIcon.Group>
		</SettingRow>
	);
}

function ZoomRow() {
	const zoom = useAppSelector(state => selectSettings(state)?.zoomPercentage);
	const canZoomAppWide = useAppSelector(selectCanZoomAppWide);
	const runCommand = useRunCommand();

	// Hidden where it can never apply, unlike a page that just has its own zoom.
	if (isMobile()) return null;
	const disabled = !canZoomAppWide;
	const current = zoom ?? 100;

	return (
		<SettingRow
			icon={<MagnifyingGlassIcon size={ICON_SIZE} />}
			label="Zoom"
			tooltip={disabled ? "This page has its own zoom." : undefined}
			disabled={disabled}>
			<ActionIcon.Group>
				<JoinedButton
					label="Zoom out"
					shortcut={ZOOM_OUT_SHORTCUT}
					disabled={disabled || current <= ZOOM_MIN}
					onClick={() => runCommand("zoom-out")}>
					<MinusIcon size={16} />
				</JoinedButton>
				<JoinedButton
					label="Reset zoom"
					shortcut={RESET_ZOOM_SHORTCUT}
					disabled={disabled || current === 100}
					onClick={() => runCommand("reset-zoom")}
					wide>
					<Box component="span" fz="xs">
						{current}%
					</Box>
				</JoinedButton>
				<JoinedButton
					label="Zoom in"
					shortcut={ZOOM_IN_SHORTCUT}
					disabled={disabled || current >= ZOOM_MAX}
					onClick={() => runCommand("zoom-in")}>
					<PlusIcon size={16} />
				</JoinedButton>
			</ActionIcon.Group>
		</SettingRow>
	);
}

function MarksRow({ menuContainer }: { menuContainer: HTMLElement | null }) {
	const slots = useAppSelector(selectMarkSlots);

	return (
		<SettingRow
			icon={<MarkIcon size={ICON_SIZE} />}
			label="Marks"
			tooltip={
				slots
					? "Places to go back to in this learning asset."
					: "Open a learning asset to use its marks."
			}
			disabled={!slots}>
			<ActionIcon.Group>
				<MarkMenuButton
					menuContainer={menuContainer}
					label="Set a mark here"
					disabled={!slots}
					items={MARK_SLOTS.map(slot => ({
						commandId: `set-mark-${slot}` as const,
						label: `Set mark ${slot} here`,
						disabled: false,
					}))}>
					<MarkIcon size={16} />
				</MarkMenuButton>
				<MarkMenuButton
					menuContainer={menuContainer}
					label={
						slots?.length === 0
							? "No marks set yet"
							: "Go to a mark"
					}
					disabled={!slots?.length}
					items={MARK_SLOTS.map(slot => ({
						commandId: `go-to-mark-${slot}` as const,
						label: `Go to mark ${slot}`,
						disabled: !slots?.includes(slot),
					}))}>
					<GoToIcon size={16} />
				</MarkMenuButton>
			</ActionIcon.Group>
		</SettingRow>
	);
}

interface MarkMenuButtonProps {
	/** Renders the menu there rather than beside the button, which would break the joined group's corners. */
	menuContainer: HTMLElement | null;
	label: string;
	disabled: boolean;
	items: { commandId: CommandId; label: string; disabled: boolean }[];
	children: ReactNode;
}

/** A button opening one item per mark, each running its command (so they match the shortcuts). */
function MarkMenuButton({
	menuContainer,
	label,
	disabled,
	items,
	children,
}: MarkMenuButtonProps) {
	const sizes = useControlSizes();
	const runCommand = useRunCommand();
	const shortcutDisplay = useShortcutDisplay();

	return (
		<Menu
			portalProps={{ target: menuContainer ?? undefined }}
			position="bottom-end"
			shadow="md">
			<Menu.Target>
				<AppTooltip label={label}>
					<ActionIcon
						variant="default"
						size={sizes.icon}
						aria-label={label}
						disabled={disabled}
						style={disabled ? DISABLED_JOINED_STYLE : undefined}>
						{children}
					</ActionIcon>
				</AppTooltip>
			</Menu.Target>
			<Menu.Dropdown>
				{items.map(item => (
					<Menu.Item
						key={item.commandId}
						disabled={item.disabled}
						rightSection={
							<Text size="xs" c="dimmed">
								{shortcutDisplay(
									commandsById[item.commandId].shortcut,
								)}
							</Text>
						}
						onClick={() => runCommand(item.commandId)}>
						{item.label}
					</Menu.Item>
				))}
			</Menu.Dropdown>
		</Menu>
	);
}

function LineWidthRow() {
	const lineWidth = useAppSelector(
		state => selectSettings(state)?.lineWidth ?? "Medium",
	);
	const smallScreen = useIsSmallScreen();
	const dispatch = useAppDispatch();
	const sizes = useControlSizes();

	// Every width fills a small screen, so the choice would change nothing there.
	if (smallScreen) return null;

	return (
		<SettingRow
			icon={<TextAlignLeftIcon size={ICON_SIZE} />}
			label="Line width">
			<SegmentedControl
				size={sizes.choice}
				aria-label="Line width"
				value={lineWidth}
				onChange={value =>
					void dispatch(
						saveSettings(
							buildUpdateSettingsRequest({
								lineWidth: value as LineWidth,
							}),
						),
					)
				}
				data={LINE_WIDTHS.map(({ value, tooltip, Icon }) => ({
					value,
					label: (
						<AppTooltip label={tooltip}>
							<Center>
								<Icon size={16} />
								<VisuallyHidden>{value}</VisuallyHidden>
							</Center>
						</AppTooltip>
					),
				}))}
			/>
		</SettingRow>
	);
}

function KeyboardRow() {
	const suppressed = useAppSelector(selectIsVirtualKeyboardSuppressed);
	// The setting only applies with touch, so it's hidden on a device without a touch screen.
	const coarsePointer = useIsCoarsePointer();
	const touchScreen = useHasTouchScreen();
	const runCommand = useRunCommand();
	const sizes = useControlSizes();

	if (!coarsePointer && !touchScreen) return null;
	// Turning it back on stays possible without touch (a tablet in a keyboard case), as it outlives a restart.
	const disabled = !coarsePointer && !suppressed;

	return (
		<SettingRow
			icon={<KeyboardIcon size={ICON_SIZE} />}
			label="On-screen keyboard"
			tooltip={disabled ? "Only used with a touch screen." : undefined}
			disabled={disabled}>
			<Switch
				size={sizes.switch}
				aria-label="On-screen keyboard"
				disabled={disabled}
				// Mantine's disabled track is the popover's own shade in dark mode, so it would vanish.
				style={{
					"--switch-disabled-color":
						"var(--mantine-color-default-border)",
				}}
				checked={!suppressed}
				onChange={() =>
					runCommand(
						suppressed
							? "enable-virtual-keyboard"
							: "disable-virtual-keyboard",
					)
				}
			/>
		</SettingRow>
	);
}

function PanelFooter({ onClose }: QuickSettingsPanelProps) {
	const runCommand = useRunCommand();
	const sizes = useControlSizes();

	return (
		<Group gap="xs" grow wrap="nowrap">
			<AppTooltip
				label="Search every command"
				shortcut={SPOTLIGHT_SHORTCUT}>
				<Button
					variant="default"
					size={sizes.button}
					leftSection={<CommandIcon size={16} />}
					onClick={() => {
						onClose();
						spotlight.open();
					}}>
					Commands
				</Button>
			</AppTooltip>
			<AppTooltip label="All settings" shortcut={OPEN_SETTINGS_SHORTCUT}>
				<Button
					variant="default"
					size={sizes.button}
					leftSection={<GearIcon size={16} />}
					onClick={() => {
						onClose();
						runCommand("open-settings");
					}}>
					Settings
				</Button>
			</AppTooltip>
		</Group>
	);
}
