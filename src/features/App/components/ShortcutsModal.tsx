import { Fragment } from "react";
import { useStore } from "react-redux";
import {
	Box,
	Group,
	Kbd,
	useMatches,
	Stack,
	Table,
	Text,
	Title,
} from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeShortcutsModal } from "../../../stores/app/appReducer";
import { selectIsShortcutsModalOpened } from "../../../stores/app/appSelectors";
import { RootState } from "../../../stores/store";
import {
	Command,
	CommandGroup,
	commandGroups,
	CommandId,
	commands,
	commandsById,
} from "../../../commands/commands";
import { firesInTextFields, shortcutsOf } from "../../../commands/commandUtils";
import { useShortcutDisplay } from "../../../commands/useShortcutDisplay";
import * as keys from "../../../config/shortcuts";

interface ShortcutRow {
	shortcuts: string[];
	description: string;
	outsideTextFields?: boolean;
}

interface ShortcutSection {
	title: CommandGroup;
	note?: string;
	rows: ShortcutRow[];
}

/** Places commands' keys in one row; those commands are then left out of the automatic rows. */
interface CommandRow {
	commands: CommandId[];
	/** Defaults to the first command's label. */
	description?: string;
}

interface ContextSection extends Omit<ShortcutSection, "rows"> {
	rows: (ShortcutRow | CommandRow)[];
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
			},
			{
				shortcuts: [
					keys.NEXT_TREE_ELEMENT_SHORTCUT,
					keys.PREVIOUS_TREE_ELEMENT_SHORTCUT,
				],
				description: "Open the next / previous element in the tree",
				outsideTextFields: true,
			},
			{ commands: ["focus-tree"] },
		],
	},
	{
		title: "Find in page",
		rows: [
			{
				shortcuts: [
					keys.FIND_NEXT_SHORTCUT,
					keys.FIND_PREVIOUS_SHORTCUT,
				],
				description: "Next / previous match",
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
				shortcuts: [keys.NEW_LINE_SHORTCUT],
				description: "New line in the chat message",
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

function rowFor(
	group: Command[],
	state: RootState,
	description = labelOf(group[0], state),
): ShortcutRow {
	const shortcuts = group.flatMap(shortcutsOf);
	return {
		shortcuts,
		description,
		outsideTextFields: group.every(
			c => !shortcutsOf(c).some(s => firesInTextFields(c, s)),
		),
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
	return commandGroups.map(group => ({
		title: group,
		rows: commands
			.filter(
				c =>
					c.group === group &&
					c.shortcut &&
					!placedCommands.has(c.id),
			)
			.filter(c => {
				if (listed.has(c.shortcut!)) return false;
				listed.add(c.shortcut!);
				return true;
			})
			.map(c => rowFor([c], state)),
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
	return [...byTitle.values()].filter(section => section.rows.length > 0);
}

function ShortcutSectionTable({ section }: { section: ShortcutSection }) {
	const display = useShortcutDisplay();

	return (
		// Kept whole in one column, with the gap as margin since columns ignore Stack gaps.
		<Stack gap={4} mb="lg" style={{ breakInside: "avoid" }}>
			<Title order={5}>{section.title}</Title>
			{section.note && (
				<Text size="xs" c="dimmed">
					{section.note}
				</Text>
			)}
			<Table>
				<Table.Tbody>
					{section.rows.map(row => (
						<Table.Tr key={row.description}>
							<Table.Td w="40%">
								<Group gap={4}>
									{row.shortcuts.map((shortcut, index) => (
										<Fragment key={shortcut}>
											{index > 0 && (
												<Text size="xs" c="dimmed">
													/
												</Text>
											)}
											<Kbd>{display(shortcut)}</Kbd>
										</Fragment>
									))}
								</Group>
							</Table.Td>
							<Table.Td>
								<Text size="sm">{row.description}</Text>
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
		</Stack>
	);
}

function ShortcutsModal() {
	const opened = useAppSelector(selectIsShortcutsModalOpened);
	const dispatch = useAppDispatch();
	const store = useStore<RootState>();
	// Built even while closed, so the content stays during the close transition.
	const sections = mergeSections([
		...commandSections(store.getState()),
		...contextSections(store.getState()),
	]);
	const columnCount = useMatches({ base: 1, md: 2 });

	return (
		<AppModal
			opened={opened}
			onClose={() => dispatch(closeShortcutsModal())}
			title="Keyboard shortcuts"
			size={960}
			fullScreenOnSmallScreen>
			<Text size="sm" c="dimmed" mb="md">
				Letters work in either case, so S also works as s.
			</Text>
			{/* CSS columns balance the rendered heights and keep the sections in order. */}
			<Box
				style={{
					columnCount,
					columnGap: "var(--mantine-spacing-xl)",
				}}>
				{sections.map(section => (
					<ShortcutSectionTable
						key={section.title}
						section={section}
					/>
				))}
			</Box>
		</AppModal>
	);
}

export default ShortcutsModal;
