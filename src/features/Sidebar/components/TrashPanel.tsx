import { Alert, Box, Stack, Text } from "@mantine/core";
import { TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { TrashedElementDto } from "../../../api/trash/dto/trashedElementDto";
import ConfirmModal from "../../../components/AppModal/ConfirmModal";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import {
	deleteElementPermanentlyAction,
	emptyTrashAction,
	loadTrash,
} from "../../../stores/trash/trashActions";
import { clearTrashError } from "../../../stores/trash/trashReducer";
import {
	selectTrash,
	selectTrashError,
} from "../../../stores/trash/trashSelectors";
import PanelHeader from "./PanelHeader";
import TrashList from "./TrashList";

/** The permanent deletion awaiting confirmation: the whole trash, or one of its
 * elements. */
type PendingDeletion =
	{ scope: "trash" } | { scope: "element"; element: TrashedElementDto };

function describeDescendants(count: number): string {
	if (count === 0) return "";
	return ` and the ${count} element${count === 1 ? "" : "s"} under it`;
}

function TrashPanel() {
	const dispatch = useAppDispatch();
	const items = useAppSelector(selectTrash);
	const error = useAppSelector(selectTrashError);
	const settings = useAppSelector(selectSettings);
	const retentionDays = settings?.trashRetentionDays ?? 0;
	const [pendingDeletion, setPendingDeletion] =
		useState<PendingDeletion | null>(null);

	useEffect(() => {
		void dispatch(loadTrash());
	}, [dispatch]);

	function handleConfirmDeletion() {
		if (!pendingDeletion) return;
		if (pendingDeletion.scope === "trash") {
			void dispatch(emptyTrashAction(items));
		} else {
			void dispatch(
				deleteElementPermanentlyAction(
					pendingDeletion.element.elementId,
				),
			);
		}
	}

	const header = (
		<PanelHeader
			title="Trash"
			actions={[
				{
					icon: <TrashIcon />,
					label: "Empty trash",
					disabled: items.length === 0,
					onClick: () => setPendingDeletion({ scope: "trash" }),
				},
			]}
		/>
	);

	const confirmModal = (
		<ConfirmModal
			opened={pendingDeletion !== null}
			title={
				pendingDeletion?.scope === "trash"
					? "Empty trash"
					: "Delete permanently"
			}
			confirmLabel={
				pendingDeletion?.scope === "trash" ? "Empty trash" : "Delete"
			}
			confirmColor="red"
			onConfirm={handleConfirmDeletion}
			onClose={() => setPendingDeletion(null)}>
			<Text>
				{pendingDeletion?.scope === "element"
					? `Permanently delete "${pendingDeletion.element.name}"${describeDescendants(pendingDeletion.element.descendantCount)}? This cannot be undone.`
					: `Permanently delete ${items.length} element${items.length === 1 ? "" : "s"} and everything under them? This cannot be undone.`}
			</Text>
		</ConfirmModal>
	);

	if (error) {
		return (
			<Stack p="md" gap="xs">
				{header}
				<Alert
					color="red"
					title={error}
					withCloseButton
					onClose={() => dispatch(clearTrashError())}
				/>
				{confirmModal}
			</Stack>
		);
	}

	if (items.length === 0) {
		return (
			<Stack p="md" gap="xs">
				{header}
				<Text size="sm" c="dimmed">
					The trash is empty.
				</Text>
				{confirmModal}
			</Stack>
		);
	}

	return (
		<Stack gap={0} py="xs">
			<Box px="md" py="sm">
				{header}
			</Box>
			{confirmModal}
			<TrashList
				items={items}
				retentionDays={retentionDays}
				onDelete={element =>
					setPendingDeletion({ scope: "element", element })
				}
			/>
		</Stack>
	);
}

export default TrashPanel;
