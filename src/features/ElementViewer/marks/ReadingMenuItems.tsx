import { Menu } from "@mantine/core";
import ReadPointMenu from "../../../components/Editor/plugins/ReadPointMenu";
import MarksMenuRow from "./MarksMenuRow";

/** A learning asset's right-click menu: its marks, then its read point. Shared by the text and PDF views. */
export default function ReadingMenuItems() {
	return (
		<>
			<MarksMenuRow />
			<Menu.Divider />
			<ReadPointMenu />
		</>
	);
}
