import { CommandMenuItem } from "../../../commands/CommandMenuItem";

/** Read point actions, shown in the editor's right-click menu for a learning asset. */
export default function ReadPointMenu() {
	return (
		<>
			<CommandMenuItem id="set-read-point">
				Set read point
			</CommandMenuItem>
			<CommandMenuItem id="clear-read-point">
				Clear read point
			</CommandMenuItem>
			<CommandMenuItem id="go-to-read-point">
				Go to read point
			</CommandMenuItem>
		</>
	);
}
