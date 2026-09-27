import { useCallback, useState } from "react";
import { Kbd } from "@mantine/core";
import type {
	SpotlightActionData,
	SpotlightActionGroupData,
} from "@mantine/spotlight";
import { useStore } from "react-redux";
import { RootState } from "../stores/store";
import { CommandId, commandGroups, commands, commandsById } from "./commands";
import { useShortcutDisplay } from "./useShortcutDisplay";
import { useRunCommand } from "./useRunCommand";

function renderShortcut(shortcut: string | undefined) {
	return shortcut && <Kbd>{shortcut}</Kbd>;
}

function buildActionGroups(
	state: RootState,
	run: (id: (typeof commands)[number]["id"]) => void,
	shortcutDisplay: (shortcut: string | undefined) => string | undefined,
): SpotlightActions[] {
	const visible = commands.filter(c => !c.enabled || c.enabled(state));

	const groups = commandGroups
		.map(group => ({
			group,
			actions: visible
				.filter(c => c.group === group)
				.map(c => ({
					id: c.id,
					label:
						typeof c.label === "function"
							? c.label(state)
							: c.label,
					leftSection: c.icon,
					rightSection: renderShortcut(shortcutDisplay(c.shortcut)),
					onClick: () => run(c.id),
				})),
		}))
		.filter(g => g.actions.length > 0);

	// A group holding only its namesake needs no header; it goes first so it isn't read as part of another group.
	const isNamesake = (g: SpotlightActionGroupData) =>
		g.actions.length === 1 && g.actions[0].label === g.group;
	return [
		...groups.filter(isNamesake).flatMap(g => g.actions),
		...groups.filter(g => !isNamesake(g)),
	];
}

type SpotlightActions = SpotlightActionData | SpotlightActionGroupData;

/** Hides search-only commands until something is typed, then matches on the label. */
export function filterCommandActions(
	query: string,
	actions: SpotlightActions[],
): SpotlightActions[] {
	const needle = query.trim().toLowerCase();
	const keep = (action: SpotlightActionData) =>
		needle
			? (action.label ?? "").toLowerCase().includes(needle)
			: !commandsById[action.id as CommandId].searchOnly;

	return actions.flatMap((item): SpotlightActions[] => {
		if (!("actions" in item)) return keep(item) ? [item] : [];
		const kept = item.actions.filter(keep);
		return kept.length > 0 ? [{ ...item, actions: kept }] : [];
	});
}

export function useSpotlightActions() {
	const store = useStore<RootState>();
	const run = useRunCommand();
	const shortcutDisplay = useShortcutDisplay();
	const [actions, setActions] = useState<SpotlightActions[]>(() =>
		buildActionGroups(store.getState(), run, shortcutDisplay),
	);

	const refresh = useCallback(
		() =>
			setActions(
				buildActionGroups(store.getState(), run, shortcutDisplay),
			),
		[store, run, shortcutDisplay],
	);

	return { actions, refresh };
}
