import { RootState } from "../stores/store";
import { selectSettings } from "../stores/settings/settingsSelector";
import type { Command } from "./commands";

/** Whether the app is currently rendering in dark mode, resolving
 * `FollowSystem` via the OS preference (same logic as `applySettings`). */
export function isCurrentlyDark(state: RootState): boolean {
	const theme = selectSettings(state)?.theme;
	if (theme === "Dark") return true;
	if (theme === "Light") return false;
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

const MODIFIER = /(^|\+)(mod|ctrl|meta|alt)\+/i;

/** The command's displayed shortcut followed by its extra ones. */
export function shortcutsOf(command: Command): string[] {
	return [
		...(command.shortcut ? [command.shortcut] : []),
		...(command.extraShortcuts ?? []),
	];
}

/** A bare printable key like `?` is something you type, so it never fires in a text field. */
export function firesInTextFields(command: Command, shortcut: string) {
	const key = shortcut.split("+").pop() ?? "";
	const isTypedCharacter = !MODIFIER.test(shortcut) && key.length === 1;
	return !command.outsideTextFields && !isTypedCharacter;
}
