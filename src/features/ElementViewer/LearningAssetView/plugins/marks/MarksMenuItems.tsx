import { Menu } from "@mantine/core";
import MarksMenuRow from "../../../marks/MarksMenuRow";

/** The marks row of a split's right-click menu, set apart from the read point items above it. */
export default function MarksMenuItems() {
	return (
		<>
			<Menu.Divider />
			<MarksMenuRow />
		</>
	);
}
