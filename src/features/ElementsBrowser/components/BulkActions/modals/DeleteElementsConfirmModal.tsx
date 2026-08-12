import { Text } from "@mantine/core";
import ConfirmModal from "../../../../../components/AppModal/ConfirmModal";
import { trashElementsBulk } from "../../../../../api/trash/api/trashApi";
import { ElementId } from "../../../../../types/elements/elementId";
import { BulkCallApi } from "../bulkCallApi";

interface DeleteElementsConfirmModalProps {
	opened: boolean;
	elementIds: ElementId[];
	callApi: BulkCallApi;
	onClose: () => void;
	onSuccess: () => void;
}

export default function DeleteElementsConfirmModal({
	opened,
	elementIds,
	callApi,
	onClose,
	onSuccess,
}: DeleteElementsConfirmModalProps) {
	function handleConfirm() {
		void callApi(async () => {
			await trashElementsBulk(elementIds);
			onSuccess();
		});
	}

	return (
		<ConfirmModal
			opened={opened}
			title="Delete elements"
			confirmLabel="Delete"
			confirmColor="red"
			onConfirm={handleConfirm}
			onClose={onClose}>
			<Text>
				The {elementIds.length} selected element
				{elementIds.length === 1 ? "" : "s"} (and anything under them)
				will be moved to the trash, where you can restore them until
				they are purged.
			</Text>
		</ConfirmModal>
	);
}
