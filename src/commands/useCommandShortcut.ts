import { CommandId, commandsById } from "./commands";
import { useShortcutDisplay } from "./useShortcutDisplay";

/** The displayable shortcut declared for a command, if any — nothing on touch input. */
export function useCommandShortcut(id: CommandId): string | undefined {
	return useShortcutDisplay()(commandsById[id].shortcut);
}
