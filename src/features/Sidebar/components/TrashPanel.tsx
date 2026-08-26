import {
	ActionIcon,
	Alert,
	Box,
	Group,
	NavLink,
	Stack,
	Text,
} from "@mantine/core";
import { ArrowCounterClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import { MouseEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { TrashedElementDto } from "../../../api/trash/dto/trashedElementDto";
import ConfirmModal from "../../../components/AppModal/ConfirmModal";
import { useElementParams } from "../../../hooks/useElementParams";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { paths } from "../../../paths";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import {
	deleteElementPermanentlyAction,
	emptyTrashAction,
	loadTrash,
	restoreElementAction,
} from "../../../stores/trash/trashActions";
import { clearTrashError } from "../../../stores/trash/trashReducer";
import {
	selectTrash,
	selectTrashError,
} from "../../../stores/trash/trashSelectors";
import { formatTrashCountdown } from "../../../utils/formatTrashCountdown";
import ElementNodeIcon from "../../App/components/ElementNodeIcon";
import PanelHeader from "./PanelHeader";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

const ICON_SIZE = 18;

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
	const navigate = useNavigate();
	const selected = useElementParams();
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
			{items.map(item => {
				const { elementId } = item;
				const isSelected =
					selected?.type === elementId.type &&
					selected?.id === elementId.id;

				// The row itself opens the element, so the buttons on it have to
				// keep their clicks to themselves.
				function withoutOpening(action: () => void) {
					return (event: MouseEvent) => {
						event.stopPropagation();
						action();
					};
				}

				return (
					<NavLink
						key={`${elementId.type}:${elementId.id}`}
						label={item.name}
						description={
							retentionDays > 0
								? formatTrashCountdown(
										item.trashedAt,
										retentionDays,
									)
								: undefined
						}
						active={isSelected}
						leftSection={
							<ElementNodeIcon
								type={elementId.type}
								size={ICON_SIZE}
							/>
						}
						rightSection={
							<Group gap={2} wrap="nowrap">
								<AppTooltip label="Restore">
									<ActionIcon
										variant="subtle"
										aria-label="Restore"
										onClick={withoutOpening(() => {
											void dispatch(
												restoreElementAction(elementId),
											);
										})}>
										<ArrowCounterClockwiseIcon size={16} />
									</ActionIcon>
								</AppTooltip>
								<AppTooltip label="Delete permanently">
									<ActionIcon
										variant="subtle"
										color="red"
										aria-label="Delete permanently"
										onClick={withoutOpening(() =>
											setPendingDeletion({
												scope: "element",
												element: item,
											}),
										)}>
										<TrashIcon size={16} />
									</ActionIcon>
								</AppTooltip>
							</Group>
						}
						onClick={() =>
							void navigate(
								paths.element(elementId.type, elementId.id),
							)
						}
					/>
				);
			})}
		</Stack>
	);
}

export default TrashPanel;
