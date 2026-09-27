import { commands } from "./commands";
import { firesInTextFields, shortcutsOf } from "./commandUtils";
import { AppHotkeyItem, useAppHotkeys } from "./useAppHotkeys";
import { useRunCommand } from "./useRunCommand";

function GlobalHotkeys() {
	const runCommand = useRunCommand();
	const inTextFields: AppHotkeyItem[] = [];
	const outsideTextFields: AppHotkeyItem[] = [];
	for (const command of commands) {
		for (const shortcut of shortcutsOf(command)) {
			const target = firesInTextFields(command, shortcut)
				? inTextFields
				: outsideTextFields;
			target.push([shortcut, () => runCommand(command.id)]);
		}
	}

	useAppHotkeys(inTextFields, [], true);
	useAppHotkeys(outsideTextFields);

	return null;
}

export default GlobalHotkeys;
