import { Text } from "@mantine/core";
import TableOfContents from "../../../components/TableOfContents/TableOfContents";
import { runReadingCommand } from "../../../commands/readingCommands";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { useIsSmallScreen } from "../../../hooks/useIsSmallScreen";
import {
	selectActiveTableOfContentsEntryId,
	selectTableOfContents,
} from "../../../stores/tableOfContents/tableOfContentsSelectors";

interface TableOfContentsPanelProps {
	onCollapse: () => void;
}

/** The open view's table of contents; reads it here, so a chapter change re-renders only this tab. */
export default function TableOfContentsPanel({
	onCollapse,
}: TableOfContentsPanelProps) {
	const dispatch = useAppDispatch();
	const tableOfContents = useAppSelector(selectTableOfContents);
	const activeEntryId = useAppSelector(selectActiveTableOfContentsEntryId);
	const isSmallScreen = useIsSmallScreen();

	if (!tableOfContents?.entries.length) {
		return (
			<Text size="sm" c="dimmed">
				No table of contents for this element.
			</Text>
		);
	}

	return (
		<TableOfContents
			// Remounted per element, so it reads that element's expanded headings.
			key={tableOfContents.ownerId}
			storageKey={tableOfContents.ownerId}
			entries={tableOfContents.entries}
			activeEntryId={activeEntryId}
			onSelect={entry => {
				dispatch(
					runReadingCommand({
						type: "go-to-table-of-contents-entry",
						entryId: entry.id,
					}),
				);
				// The panel covers the content on small screens, so it gets out of the way of the jump.
				if (isSmallScreen) onCollapse();
			}}
		/>
	);
}
