import { useCallback, useState } from "react";
import { Kbd } from "@mantine/core";
import type { SpotlightActionGroupData } from "@mantine/spotlight";
import { useStore } from "react-redux";
import { RootState } from "../stores/store";
import { commandGroups, commands } from "./commands";
import { useShortcutDisplay } from "./useShortcutDisplay";
import { useRunCommand } from "./useRunCommand";

function renderShortcut(shortcut: string | undefined) {
	return shortcut && <Kbd>{shortcut}</Kbd>;
}

function buildActionGroups(
	state: RootState,
	run: (id: (typeof commands)[number]["id"]) => void,
	shortcutDisplay: (shortcut: string | undefined) => string | undefined,
): SpotlightActionGroupData[] {
	const visible = commands.filter(c => !c.enabled || c.enabled(state));

	return commandGroups
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
}

export function useSpotlightActions() {
	const store = useStore<RootState>();
	const run = useRunCommand();
	const shortcutDisplay = useShortcutDisplay();
	const [actions, setActions] = useState<SpotlightActionGroupData[]>(() =>
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
