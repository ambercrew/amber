import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { MarkSlot } from "../../../types/elements/learningAssetMark";

const UNDO_AUTO_CLOSE_IN_MILLISECONDS = 6000;

function notificationId(slot: MarkSlot) {
	return `mark-${slot}-undo`;
}

/** Confirms a placed mark with an Undo button, replacing any earlier one for the same slot. */
export function showMarkUndoNotification(
	slot: MarkSlot,
	moved: boolean,
	onUndo: () => void,
) {
	const id = notificationId(slot);
	notifications.hide(id);
	notifications.show({
		id,
		autoClose: UNDO_AUTO_CLOSE_IN_MILLISECONDS,
		message: (
			<Group justify="space-between" wrap="nowrap">
				<Text size="sm">
					{moved ? `Mark ${slot} moved` : `Mark ${slot} set`}
				</Text>
				<Button
					size="compact-sm"
					variant="subtle"
					onClick={() => {
						notifications.hide(id);
						onUndo();
					}}>
					Undo
				</Button>
			</Group>
		),
	});
}
