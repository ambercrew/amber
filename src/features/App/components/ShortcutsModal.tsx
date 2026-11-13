import { Fragment, useState } from "react";
import { useStore } from "react-redux";
import {
	Box,
	Button,
	Collapse,
	Group,
	Highlight,
	Kbd,
	SimpleGrid,
	Stack,
	Table,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import {
	CaretDownIcon,
	CaretRightIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import AppModal from "../../../components/AppModal/AppModal";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeShortcutsModal } from "../../../stores/app/appReducer";
import { selectIsShortcutsModalOpened } from "../../../stores/app/appSelectors";
import { RootState } from "../../../stores/store";
import {
	Command,
	CommandGroup,
	CommandId,
	commands,
	commandsById,
} from "../../../commands/commands";
import { firesInTextFields, shortcutsOf } from "../../../commands/commandUtils";
import { useShortcutDisplay } from "../../../commands/useShortcutDisplay";
import * as keys from "../../../config/shortcuts";

/** How a row's keys are shown: one per key, or the shared modifiers once with the first and last keys ("Ctrl + 1–3", "Alt + ← →"). */
type KeyJoin = "list" | "range" | "pair";

interface ShortcutRow {
	shortcuts: string[];
	description: string;
	outsideTextFields?: boolean;
	join?: KeyJoin;
	/** Keys every app has (find, zoom), folded away under "Standard". */
	standard?: boolean;
}

type SectionTitle = Exclude<CommandGroup, "Find in page" | "Zoom"> | "View";

interface ShortcutSection {
	title: SectionTitle;
	note?: string;
	rows: ShortcutRow[];
}

/** Places commands' keys in one row; those commands are then left out of the automatic rows. */
interface CommandRow {
	commands: CommandId[];
	/** Defaults to the first command's label. */
	description?: string;
	join?: KeyJoin;
}

interface ContextSection extends Omit<ShortcutSection, "rows"> {
	rows: (ShortcutRow | CommandRow)[];
}

// General keys first, then working with content and studying.
const SECTION_ORDER: Record<SectionTitle, number> = {
	App: 0,
	Navigation: 1,
	View: 2,
	AI: 3,
	Elements: 4,
	Editor: 5,
	Study: 6,
};

// Splits the sections into two columns of roughly equal height.
const SECOND_COLUMN_START: SectionTitle = "Elements";

const VIEW_COMMANDS = new Set<CommandId>([
	"toggle-left-sidebar",
	"toggle-right-sidebar",
]);

const STANDARD_COMMANDS = new Set<CommandId>([
	"find-in-page",
	"zoom-in",
	"zoom-out",
	"reset-zoom",
]);

function sectionOf(command: Command): SectionTitle {
	if (command.group === "Find in page" || command.group === "Zoom")
		return "View";
	return VIEW_COMMANDS.has(command.id) ? "View" : command.group;
}

// Keys that aren't commands, filed under the command group they belong with.
const CONTEXT_SECTIONS: ContextSection[] = [
	{
		title: "App",
		rows: [
			{
				shortcuts: [keys.SPOTLIGHT_SHORTCUT],
				description: "Open command palette",
			},
		],
	},
	{
		title: "Navigation",
		rows: [
			{
				commands: ["go-back", "go-forward"],
				description: "Go back / forward",
				join: "pair",
			},
			{
				shortcuts: [
					keys.NEXT_TREE_ELEMENT_SHORTCUT,
					keys.PREVIOUS_TREE_ELEMENT_SHORTCUT,
				],
				description: "Open the next / previous element in the tree",
				outsideTextFields: true,
				join: "pair",
			},
			{ commands: ["focus-tree"] },
		],
	},
	{
		title: "View",
		rows: [
			{
				shortcuts: [
					keys.FIND_NEXT_SHORTCUT,
					keys.FIND_PREVIOUS_SHORTCUT,
				],
				description: "Next / previous match",
				standard: true,
			},
		],
	},
	{
		title: "Elements",
		rows: [
			{
				commands: ["set-mark-1", "set-mark-2", "set-mark-3"],
				description: "Set mark",
				join: "range",
			},
			{
				commands: ["go-to-mark-1", "go-to-mark-2", "go-to-mark-3"],
				description: "Go to mark",
				join: "range",
			},
		],
	},
	{
		title: "Editor",
		rows: [
			{
				shortcuts: [keys.CREATE_EXTRACT_SHORTCUT],
				description: "Create extract from the selection",
			},
			{
				shortcuts: [keys.CREATE_CLOZE_SHORTCUT],
				description: "Create cloze from the selection",
			},
			{
				shortcuts: [keys.OPEN_HIGHLIGHT_SHORTCUT],
				description: "Open the extract or cloze at the cursor",
			},
			{
				shortcuts: [keys.REMOVE_HIGHLIGHT_SHORTCUT],
				description:
					"Remove highlight at the cursor or in the selection",
			},
			{
				shortcuts: [keys.SLASH_MENU_SHORTCUT],
				description: "Open the block insert menu",
			},
		],
	},
	{
		title: "Study",
		rows: [
			{
				shortcuts: [keys.SHOW_ANSWER_SHORTCUT],
				description: "Show answer",
				outsideTextFields: true,
			},
			{
				shortcuts: [
					keys.GRADE_AGAIN_SHORTCUT,
					keys.GRADE_HARD_SHORTCUT,
					keys.GRADE_GOOD_SHORTCUT,
					keys.GRADE_EASY_SHORTCUT,
				],
				description: "Again / Hard / Good / Easy",
				outsideTextFields: true,
				join: "range",
			},
			{
				shortcuts: [keys.SKIP_LEARNING_ASSET_SHORTCUT],
				description: "Skip: move to the end of the queue",
				outsideTextFields: true,
			},
			{
				shortcuts: [keys.NEXT_LEARNING_ASSET_SHORTCUT],
				description: "Next: reschedule to the next interval",
				outsideTextFields: true,
			},
			{
				shortcuts: [keys.PICK_DUE_DATE_SHORTCUT],
				description: "Pick a due date",
				outsideTextFields: true,
			},
			{
				shortcuts: [keys.FINISH_LEARNING_ASSET_SHORTCUT],
				description: "Finish: won't repeat",
				outsideTextFields: true,
			},
		],
	},
	{
		title: "AI",
		rows: [
			{
				shortcuts: [keys.ADD_TO_AI_CONTEXT_SHORTCUT],
				description: "Add the selection to AI context",
			},
			{
				shortcuts: [keys.MAKE_AI_CARDS_SHORTCUT],
				description: "Ask the AI to turn the selection into cards",
			},
			{
				shortcuts: [keys.NEW_LINE_SHORTCUT],
				description: "New line in the chat message",
			},
			{
				shortcuts: [keys.INSERT_AI_PROMPT_SHORTCUT],
				description: "Insert a saved prompt in the chat message",
			},
			{
				shortcuts: [
					keys.NEXT_PROMPT_PLACEHOLDER_SHORTCUT,
					keys.PREVIOUS_PROMPT_PLACEHOLDER_SHORTCUT,
				],
				description:
					"Select the next or previous {placeholder} in the chat message",
			},
		],
	},
];

function labelOf(command: Command, state: RootState) {
	if (command.shortcutLabel) return command.shortcutLabel;
	return typeof command.label === "function"
		? command.label(state)
		: command.label;
}

/** Only each command's displayed key gets a row; aliases like `mod+=` still work. */
function rowFor(
	group: Command[],
	state: RootState,
	description = labelOf(group[0], state),
	join?: KeyJoin,
): ShortcutRow {
	return {
		shortcuts: group.flatMap(c => (c.shortcut ? [c.shortcut] : [])),
		description,
		outsideTextFields: group.every(
			c => !shortcutsOf(c).some(s => firesInTextFields(c, s)),
		),
		join,
		standard: group.every(c => STANDARD_COMMANDS.has(c.id)),
	};
}

const placedCommands = new Set<CommandId>(
	CONTEXT_SECTIONS.flatMap(section =>
		section.rows.flatMap(row => ("commands" in row ? row.commands : [])),
	),
);

function commandSections(state: RootState): ShortcutSection[] {
	// A key shared by several commands (study / edit mode) is listed once.
	const listed = new Set<string>();
	const rows = commands
		.filter(c => c.shortcut && !placedCommands.has(c.id))
		.filter(c => {
			if (listed.has(c.shortcut!)) return false;
			listed.add(c.shortcut!);
			return true;
		})
		.map(c => ({ title: sectionOf(c), row: rowFor([c], state) }));
	return Object.keys(SECTION_ORDER).map(title => ({
		title: title as SectionTitle,
		rows: rows.filter(r => r.title === title).map(r => r.row),
	}));
}

function contextSections(state: RootState): ShortcutSection[] {
	return CONTEXT_SECTIONS.map(section => ({
		...section,
		rows: section.rows.map(row =>
			"commands" in row
				? rowFor(
						row.commands.map(id => commandsById[id]),
						state,
						row.description,
						row.join,
					)
				: row,
		),
	}));
}

/** Joins sections sharing a title, such as a command group and its context keys. */
function mergeSections(sections: ShortcutSection[]): ShortcutSection[] {
	const byTitle = new Map<string, ShortcutSection>();
	for (const section of sections) {
		const existing = byTitle.get(section.title);
		if (existing) {
			existing.rows = [...existing.rows, ...section.rows];
			existing.note ??= section.note;
		} else byTitle.set(section.title, { ...section });
	}
	return [...byTitle.values()]
		.filter(section => section.rows.length > 0)
		.sort((a, b) => SECTION_ORDER[a.title] - SECTION_ORDER[b.title]);
}

type Display = ReturnType<typeof useShortcutDisplay>;

/** The labels a row's keys are shown as, one per `Kbd`. */
function keyLabels(row: ShortcutRow, display: Display): string[] {
	const { shortcuts, join = "list" } = row;
	if (join !== "list" && shortcuts.length > 1) {
		const first = display(shortcuts[0]);
		const last = display(shortcuts[shortcuts.length - 1].split("+").pop());
		if (!first || !last) return [];
		return [`${first}${join === "range" ? "–" : " "}${last}`];
	}
	return shortcuts.flatMap(shortcut => display(shortcut) ?? []);
}

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, "");

/** Matches the description or any key, ignoring case and spacing ("ctrl+k" finds "Ctrl + K"). */
function matchesQuery(row: ShortcutRow, query: string, display: Display) {
	const needle = squash(query);
	if (!needle) return true;
	const haystack = [
		row.description,
		...keyLabels(row, display),
		...row.shortcuts.map(shortcut => display(shortcut) ?? ""),
	];
	return haystack.some(text => squash(text).includes(needle));
}

interface ShortcutRowsProps {
	rows: ShortcutRow[];
	/** Search text, marked wherever it appears in a description or key. */
	query: string;
}

function ShortcutRows({ rows, query }: ShortcutRowsProps) {
	const display = useShortcutDisplay();
	const highlight = query.trim();

	return (
		<Table>
			<Table.Tbody>
				{rows.map(row => (
					<Table.Tr key={row.description}>
						<Table.Td w="40%">
							<Group gap={4}>
								{keyLabels(row, display).map((label, index) => (
									<Fragment key={label}>
										{index > 0 && (
											<Text size="xs" c="dimmed">
												/
											</Text>
										)}
										<Kbd>
											<Highlight
												component="span"
												inherit
												highlight={highlight}>
												{label}
											</Highlight>
										</Kbd>
									</Fragment>
								))}
							</Group>
						</Table.Td>
						<Table.Td>
							<Highlight size="sm" highlight={highlight}>
								{row.description}
							</Highlight>
							{row.outsideTextFields && (
								<Text size="xs" c="dimmed">
									Outside text fields
								</Text>
							)}
						</Table.Td>
					</Table.Tr>
				))}
			</Table.Tbody>
		</Table>
	);
}

interface ShortcutSectionTableProps {
	section: ShortcutSection;
	query: string;
}

function ShortcutSectionTable({ section, query }: ShortcutSectionTableProps) {
	const [standardOpened, setStandardOpened] = useState(false);
	// While searching, matching standard keys show without the toggle.
	const expandStandard = query.trim() !== "";
	const ownRows = section.rows.filter(row => !row.standard);
	const standardRows = section.rows.filter(row => row.standard);

	return (
		<Stack gap={4} mb="lg">
			<Title order={5}>{section.title}</Title>
			{section.note && (
				<Text size="xs" c="dimmed">
					{section.note}
				</Text>
			)}
			{ownRows.length > 0 && (
				<ShortcutRows rows={ownRows} query={query} />
			)}
			{standardRows.length > 0 &&
				(expandStandard ? (
					<ShortcutRows rows={standardRows} query={query} />
				) : (
					<>
						<Button
							variant="subtle"
							color="gray"
							size="compact-sm"
							justify="flex-start"
							leftSection={
								standardOpened ? (
									<CaretDownIcon />
								) : (
									<CaretRightIcon />
								)
							}
							aria-expanded={standardOpened}
							onClick={() => setStandardOpened(o => !o)}>
							Standard ({standardRows.length})
						</Button>
						<Collapse expanded={standardOpened}>
							<ShortcutRows rows={standardRows} query={query} />
						</Collapse>
					</>
				))}
		</Stack>
	);
}

function ShortcutsModal() {
	const opened = useAppSelector(selectIsShortcutsModalOpened);
	const dispatch = useAppDispatch();
	const store = useStore<RootState>();
	const display = useShortcutDisplay();
	const [query, setQuery] = useState("");
	// Built even while closed, so the content stays during the close transition.
	const sections = mergeSections([
		...commandSections(store.getState()),
		...contextSections(store.getState()),
	])
		.map(section => ({
			...section,
			rows: section.rows.filter(row => matchesQuery(row, query, display)),
		}))
		.filter(section => section.rows.length > 0);
	// An emptied column is dropped, so a search's matches always start on the left.
	const columns = [
		sections.filter(
			s => SECTION_ORDER[s.title] < SECTION_ORDER[SECOND_COLUMN_START],
		),
		sections.filter(
			s => SECTION_ORDER[s.title] >= SECTION_ORDER[SECOND_COLUMN_START],
		),
	].filter(column => column.length > 0);

	return (
		<AppModal
			opened={opened}
			onClose={() => dispatch(closeShortcutsModal())}
			onExitTransitionEnd={() => setQuery("")}
			title="Keyboard shortcuts"
			size={960}
			fullScreenOnSmallScreen>
			<TextInput
				data-autofocus
				placeholder="Search shortcuts"
				aria-label="Search shortcuts"
				leftSection={<MagnifyingGlassIcon />}
				value={query}
				onChange={event => setQuery(event.currentTarget.value)}
				mb="xs"
			/>
			<Text size="sm" c="dimmed" mb="md">
				Letters work in either case, so S also works as s.
			</Text>
			{sections.length === 0 ? (
				<Text size="sm" c="dimmed" ta="center" py="xl">
					No shortcuts match “{query.trim()}”.
				</Text>
			) : (
				<SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
					{columns.map(column => (
						<Box key={column[0].title}>
							{column.map(section => (
								<ShortcutSectionTable
									key={section.title}
									section={section}
									query={query}
								/>
							))}
						</Box>
					))}
				</SimpleGrid>
			)}
		</AppModal>
	);
}

export default ShortcutsModal;
