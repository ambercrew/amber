import { ReactNode } from "react";
import { Menu, Text } from "@mantine/core";
import { CommandId } from "./commands";
import { commandIcon } from "./commandIcon";
import { useCommandShortcut } from "./useCommandShortcut";
import { useRunCommand } from "./useRunCommand";

interface CommandMenuItemProps {
	id: CommandId;
	children: ReactNode;
}

/** A `Menu.Item` wired to a command: icon, shortcut, and click-to-run all sourced from its declaration in `commands.ts`. */
export function CommandMenuItem({ id, children }: CommandMenuItemProps) {
	const runCommand = useRunCommand();
	const shortcut = useCommandShortcut(id);

	return (
		<Menu.Item
			leftSection={commandIcon(id)}
			rightSection={
				shortcut && (
					<Text size="xs" c="dimmed" ml="md">
						{shortcut}
					</Text>
				)
			}
			onClick={() => runCommand(id)}>
			{children}
		</Menu.Item>
	);
}
