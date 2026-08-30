import { commands } from "./commands";
import { AppHotkeyItem, useAppHotkeys } from "./useAppHotkeys";
import { useRunCommand } from "./useRunCommand";

function GlobalHotkeys() {
	const run = useRunCommand();

	useAppHotkeys(
		commands
			.filter(c => c.shortcut)
			.map(c => [c.shortcut!, () => run(c.id)] as AppHotkeyItem),
		[],
		true,
	);

	return null;
}

export default GlobalHotkeys;
