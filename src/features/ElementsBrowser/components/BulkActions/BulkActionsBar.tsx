import { Button, Group, Menu, Text } from "@mantine/core";
import {
	ArrowCounterClockwiseIcon,
	BookOpenIcon,
	CalendarBlankIcon,
	CalendarIcon,
	CardsIcon,
	CaretDownIcon,
	GraduationCapIcon,
	MinusIcon,
	PlusIcon,
	TagIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { setElementsStatus } from "../../../../api/study/api/studyApi";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import { BibliographicalSourceResponseDto } from "../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { SearchElementResultDto } from "../../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../../types/elements/elementId";
import useApi from "../../../../hooks/useApi";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { loadElementTree } from "../../../../stores/elements/elementsActions";
import {
	ElementStatus,
	elementStatusOptions,
} from "../../../../types/study/elementStatus";
import {
	ELEMENT_STATUS_ICONS,
	StatusPropertyIcon,
} from "../../../../config/icons";
import { BulkCallApi } from "./bulkCallApi";
import ResetRepetitionsConfirmModal from "./modals/ResetRepetitionsConfirmModal";
import SetDueDateModal from "./modals/SetDueDateModal";
import SetStudyProfileModal from "./modals/SetStudyProfileModal";
import AddTagModal from "./modals/AddTagModal";
import RemoveTagModal from "./modals/RemoveTagModal";
import SetSourceModal from "./modals/SetSourceModal";
import DeleteElementsConfirmModal from "./modals/DeleteElementsConfirmModal";

type OpenModal =
	| "reset"
	| "due"
	| "profile"
	| "addTag"
	| "removeTag"
	| "source"
	| "delete"
	| null;

function statusMessage(
	status: ElementStatus,
	label: string,
	applied: number,
	total: number,
): string {
	const message = `Status set to ${label.toLowerCase()}`;
	const skipped = total - applied;
	if (skipped === 0) return message;
	const reason =
		status === "finished"
			? "only learning assets and extracts can be finished"
			: "folders have no status, and deleted elements are skipped";
	return `${message} for ${applied} of ${total}; ${skipped} skipped (${reason})`;
}

function selectionLabel(selectedCount: number, resultCount: number): string {
	if (selectedCount === 0) {
		return resultCount === 1 ? "1 result" : `${resultCount} results`;
	}
	if (selectedCount === resultCount && resultCount > 1) {
		return `All ${resultCount} selected`;
	}
	return `${selectedCount} of ${resultCount} selected`;
}

interface BulkActionsBarProps {
	selectedIds: ElementId[];
	selectedResults: SearchElementResultDto[];
	resultCount: number;
	profiles: StudyProfileDto[];
	sources: BibliographicalSourceResponseDto[];
	onClearSelection: () => void;
	onActionComplete: () => void;
}

export default function BulkActionsBar({
	selectedIds,
	selectedResults,
	resultCount,
	profiles,
	sources,
	onClearSelection,
	onActionComplete,
}: BulkActionsBarProps) {
	const [openModal, setOpenModal] = useState<OpenModal>(null);
	const [openSeq, setOpenSeq] = useState(0);
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	const dispatch = useAppDispatch();

	const hasSelection = selectedIds.length > 0;
	const firstDueDate =
		selectedResults.find(result => result.due)?.due ?? null;

	const bulkCallApi: BulkCallApi = cb =>
		callApi(cb, () => dispatch(loadElementTree()));

	useEffect(() => {
		if (!errorMessage) return;
		notifications.show({ message: errorMessage, color: "red" });
		clearErrorMessage();
	}, [errorMessage, clearErrorMessage]);

	function openBulkModal(type: OpenModal) {
		setOpenModal(type);
		setOpenSeq(seq => seq + 1);
	}

	function closeModal() {
		setOpenModal(null);
	}

	function handleSuccess(message: string) {
		notifications.show({ message });
		closeModal();
		onClearSelection();
		onActionComplete();
	}

	function handleSetStatus(status: ElementStatus, label: string) {
		void bulkCallApi(async () => {
			const applied = await setElementsStatus(selectedIds, status);
			handleSuccess(
				statusMessage(status, label, applied, selectedIds.length),
			);
		});
	}

	return (
		<>
			<Group gap="xs" wrap="wrap" align="center">
				<Text size="sm" c="dimmed">
					{selectionLabel(selectedIds.length, resultCount)}
				</Text>
				<Menu
					position="bottom-start"
					shadow="md"
					withinPortal
					disabled={!hasSelection}>
					<Menu.Target>
						<Button
							variant="default"
							disabled={!hasSelection}
							px="xs"
							rightSection={<CaretDownIcon size={16} />}>
							Actions
						</Button>
					</Menu.Target>
					<Menu.Dropdown>
						<Menu.Sub position="right-start" shadow="md">
							<Menu.Sub.Target>
								<Menu.Sub.Item
									leftSection={<CalendarIcon size={16} />}>
									Reschedule
								</Menu.Sub.Item>
							</Menu.Sub.Target>
							<Menu.Sub.Dropdown>
								<Menu.Sub position="right-start" shadow="md">
									<Menu.Sub.Target>
										<Menu.Sub.Item
											leftSection={
												<CardsIcon size={16} />
											}>
											Cards
										</Menu.Sub.Item>
									</Menu.Sub.Target>
									<Menu.Sub.Dropdown>
										<Menu.Item
											leftSection={
												<ArrowCounterClockwiseIcon
													size={16}
												/>
											}
											onClick={() =>
												openBulkModal("reset")
											}>
											Reset repetitions
										</Menu.Item>
									</Menu.Sub.Dropdown>
								</Menu.Sub>
								<Menu.Item
									leftSection={
										<CalendarBlankIcon size={16} />
									}
									onClick={() => openBulkModal("due")}>
									Set due date
								</Menu.Item>
								<Menu.Item
									leftSection={
										<GraduationCapIcon size={16} />
									}
									onClick={() => openBulkModal("profile")}>
									Set study profile
								</Menu.Item>
							</Menu.Sub.Dropdown>
						</Menu.Sub>
						<Menu.Sub position="right-start" shadow="md">
							<Menu.Sub.Target>
								<Menu.Sub.Item
									leftSection={
										<StatusPropertyIcon size={16} />
									}>
									Set status
								</Menu.Sub.Item>
							</Menu.Sub.Target>
							<Menu.Sub.Dropdown>
								{elementStatusOptions.map(option => {
									const StatusIcon =
										ELEMENT_STATUS_ICONS[option.value];
									return (
										<Menu.Item
											key={option.value}
											leftSection={
												<StatusIcon size={16} />
											}
											onClick={() =>
												handleSetStatus(
													option.value,
													option.label,
												)
											}>
											{option.label}
										</Menu.Item>
									);
								})}
							</Menu.Sub.Dropdown>
						</Menu.Sub>
						<Menu.Sub position="right-start" shadow="md">
							<Menu.Sub.Target>
								<Menu.Sub.Item
									leftSection={<TagIcon size={16} />}>
									Tags
								</Menu.Sub.Item>
							</Menu.Sub.Target>
							<Menu.Sub.Dropdown>
								<Menu.Item
									leftSection={<PlusIcon size={16} />}
									onClick={() => openBulkModal("addTag")}>
									Add tag
								</Menu.Item>
								<Menu.Item
									leftSection={<MinusIcon size={16} />}
									onClick={() => openBulkModal("removeTag")}>
									Remove tag
								</Menu.Item>
							</Menu.Sub.Dropdown>
						</Menu.Sub>
						<Menu.Divider />
						<Menu.Item
							leftSection={<BookOpenIcon size={16} />}
							onClick={() => openBulkModal("source")}>
							Set source
						</Menu.Item>
						<Menu.Item
							color="red"
							leftSection={<TrashIcon size={16} />}
							onClick={() => openBulkModal("delete")}>
							Delete elements
						</Menu.Item>
					</Menu.Dropdown>
				</Menu>
			</Group>

			<Fragment key={openSeq}>
				<ResetRepetitionsConfirmModal
					opened={openModal === "reset"}
					elementIds={selectedIds}
					callApi={bulkCallApi}
					onClose={closeModal}
					onSuccess={() => handleSuccess("Repetitions reset")}
				/>
				<SetDueDateModal
					opened={openModal === "due"}
					elementIds={selectedIds}
					defaultDue={firstDueDate}
					callApi={bulkCallApi}
					onClose={closeModal}
					onSuccess={() => handleSuccess("Due date updated")}
				/>
				<SetStudyProfileModal
					opened={openModal === "profile"}
					elementIds={selectedIds}
					profiles={profiles}
					callApi={bulkCallApi}
					onClose={closeModal}
					onSuccess={() => handleSuccess("Study profile updated")}
				/>
				<AddTagModal
					opened={openModal === "addTag"}
					elementIds={selectedIds}
					callApi={bulkCallApi}
					onClose={closeModal}
					onSuccess={() => handleSuccess("Tags added")}
				/>
				<RemoveTagModal
					opened={openModal === "removeTag"}
					elementIds={selectedIds}
					selectedResults={selectedResults}
					callApi={bulkCallApi}
					onClose={closeModal}
					onSuccess={() => handleSuccess("Tags removed")}
				/>
				<SetSourceModal
					opened={openModal === "source"}
					elementIds={selectedIds}
					sources={sources}
					callApi={bulkCallApi}
					onClose={closeModal}
					onSuccess={() => handleSuccess("Source updated")}
				/>
				<DeleteElementsConfirmModal
					opened={openModal === "delete"}
					elementIds={selectedIds}
					callApi={bulkCallApi}
					onClose={closeModal}
					onSuccess={() => handleSuccess("Elements deleted")}
				/>
			</Fragment>
		</>
	);
}
