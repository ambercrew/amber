import { Button, Group, Menu, Text } from "@mantine/core";
import {
	ArrowCounterClockwiseIcon,
	ArrowUUpLeftIcon,
	BookOpenIcon,
	CalendarIcon,
	CardsIcon,
	CaretDownIcon,
	CheckCircleIcon,
	FileTextIcon,
	GraduationCapIcon,
	MinusIcon,
	PlusIcon,
	TagIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import {
	finishLearningAssetsBulk,
	unfinishLearningAssetsBulk,
} from "../../../../api/study/api/studyApi";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import { BibliographicalSourceResponseDto } from "../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { SearchElementResultDto } from "../../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../../types/elements/elementId";
import useApi from "../../../../hooks/useApi";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { loadElementTree } from "../../../../stores/elements/elementsActions";
import { BulkCallApi } from "./bulkCallApi";
import ResetRepetitionsConfirmModal from "./modals/ResetRepetitionsConfirmModal";
import SetStudyProfileModal from "./modals/SetStudyProfileModal";
import AddTagModal from "./modals/AddTagModal";
import RemoveTagModal from "./modals/RemoveTagModal";
import SetSourceModal from "./modals/SetSourceModal";
import DeleteElementsConfirmModal from "./modals/DeleteElementsConfirmModal";

type OpenModal =
	"reset" | "profile" | "addTag" | "removeTag" | "source" | "delete" | null;

interface BulkActionsBarProps {
	selectedIds: ElementId[];
	selectedResults: SearchElementResultDto[];
	profiles: StudyProfileDto[];
	sources: BibliographicalSourceResponseDto[];
	onClearSelection: () => void;
	onActionComplete: () => void;
}

export default function BulkActionsBar({
	selectedIds,
	selectedResults,
	profiles,
	sources,
	onClearSelection,
	onActionComplete,
}: BulkActionsBarProps) {
	const [openModal, setOpenModal] = useState<OpenModal>(null);
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	const dispatch = useAppDispatch();

	const hasSelection = selectedIds.length > 0;

	const bulkCallApi: BulkCallApi = cb =>
		callApi(cb, () => dispatch(loadElementTree()));

	useEffect(() => {
		if (!errorMessage) return;
		notifications.show({ message: errorMessage, color: "red" });
		clearErrorMessage();
	}, [errorMessage, clearErrorMessage]);

	function closeModal() {
		setOpenModal(null);
	}

	function handleSuccess(message: string) {
		notifications.show({ message });
		closeModal();
		onClearSelection();
		onActionComplete();
	}

	function handleMarkAsFinished() {
		void bulkCallApi(async () => {
			await finishLearningAssetsBulk(selectedIds);
			handleSuccess("Marked as finished");
		});
	}

	function handleUnfinish() {
		void bulkCallApi(async () => {
			await unfinishLearningAssetsBulk(selectedIds);
			handleSuccess("Marked as unfinished");
		});
	}

	return (
		<>
			<Group gap="xs" wrap="wrap" align="center">
				<Text size="sm" c="dimmed">
					{hasSelection
						? `${selectedIds.length} selected`
						: "No elements selected"}
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
												setOpenModal("reset")
											}>
											Reset repetitions
										</Menu.Item>
									</Menu.Sub.Dropdown>
								</Menu.Sub>
								<Menu.Sub position="right-start" shadow="md">
									<Menu.Sub.Target>
										<Menu.Sub.Item
											leftSection={
												<FileTextIcon size={16} />
											}>
											Learning assets/extracts
										</Menu.Sub.Item>
									</Menu.Sub.Target>
									<Menu.Sub.Dropdown>
										<Menu.Item
											leftSection={
												<CheckCircleIcon size={16} />
											}
											onClick={handleMarkAsFinished}>
											Mark as finished
										</Menu.Item>
										<Menu.Item
											leftSection={
												<ArrowUUpLeftIcon size={16} />
											}
											onClick={handleUnfinish}>
											Unfinish
										</Menu.Item>
									</Menu.Sub.Dropdown>
								</Menu.Sub>
								<Menu.Item
									leftSection={
										<GraduationCapIcon size={16} />
									}
									onClick={() => setOpenModal("profile")}>
									Set study profile
								</Menu.Item>
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
									onClick={() => setOpenModal("addTag")}>
									Add tag
								</Menu.Item>
								<Menu.Item
									leftSection={<MinusIcon size={16} />}
									onClick={() => setOpenModal("removeTag")}>
									Remove tag
								</Menu.Item>
							</Menu.Sub.Dropdown>
						</Menu.Sub>
						<Menu.Divider />
						<Menu.Item
							leftSection={<BookOpenIcon size={16} />}
							onClick={() => setOpenModal("source")}>
							Set source
						</Menu.Item>
						<Menu.Item
							color="red"
							leftSection={<TrashIcon size={16} />}
							onClick={() => setOpenModal("delete")}>
							Delete elements
						</Menu.Item>
					</Menu.Dropdown>
				</Menu>
			</Group>

			<ResetRepetitionsConfirmModal
				opened={openModal === "reset"}
				elementIds={selectedIds}
				callApi={bulkCallApi}
				onClose={closeModal}
				onSuccess={() => handleSuccess("Repetitions reset")}
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
		</>
	);
}
