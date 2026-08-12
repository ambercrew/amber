import { Button, Group, Menu, Text } from "@mantine/core";
import {
	ArrowCounterClockwiseIcon,
	BookOpenIcon,
	CalendarIcon,
	CaretDownIcon,
	CaretRightIcon,
	CheckCircleIcon,
	GraduationCapIcon,
	MinusIcon,
	PlusIcon,
	TagIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { finishLearningAssetsBulk } from "../../../../api/study/api/studyApi";
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
	const { callApi } = useApi();
	const dispatch = useAppDispatch();

	const hasSelection = selectedIds.length > 0;

	const bulkCallApi: BulkCallApi = cb =>
		callApi(cb, () => dispatch(loadElementTree()));

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
						<Menu
							trigger="hover"
							position="right-start"
							shadow="md"
							withinPortal>
							<Menu.Target>
								<Menu.Item
									leftSection={<CalendarIcon size={16} />}
									rightSection={<CaretRightIcon size={14} />}>
									Reschedule
								</Menu.Item>
							</Menu.Target>
							<Menu.Dropdown>
								<Menu.Item
									leftSection={
										<ArrowCounterClockwiseIcon size={16} />
									}
									onClick={() => setOpenModal("reset")}>
									Reset repetitions
								</Menu.Item>
								<Menu.Item
									leftSection={<CheckCircleIcon size={16} />}
									onClick={handleMarkAsFinished}>
									Mark learning assets/extracts as finished
								</Menu.Item>
								<Menu.Item
									leftSection={
										<GraduationCapIcon size={16} />
									}
									onClick={() => setOpenModal("profile")}>
									Set study profile
								</Menu.Item>
							</Menu.Dropdown>
						</Menu>
						<Menu
							trigger="hover"
							position="right-start"
							shadow="md"
							withinPortal>
							<Menu.Target>
								<Menu.Item
									leftSection={<TagIcon size={16} />}
									rightSection={<CaretRightIcon size={14} />}>
									Tags
								</Menu.Item>
							</Menu.Target>
							<Menu.Dropdown>
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
							</Menu.Dropdown>
						</Menu>
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
