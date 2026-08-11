import { Text } from "@mantine/core";
import ConfirmModal from "../../../../../components/AppModal/ConfirmModal";
import { resetRepetitionsBulk } from "../../../../../api/study/api/studyApi";
import { ElementId } from "../../../../../types/elements/elementId";
import { BulkCallApi } from "../bulkCallApi";

interface ResetRepetitionsConfirmModalProps {
	opened: boolean;
	elementIds: ElementId[];
	callApi: BulkCallApi;
	onClose: () => void;
	onSuccess: () => void;
}

export default function ResetRepetitionsConfirmModal({
	opened,
	elementIds,
	callApi,
	onClose,
	onSuccess,
}: ResetRepetitionsConfirmModalProps) {
	function handleConfirm() {
		void callApi(async () => {
			await resetRepetitionsBulk(elementIds);
			onSuccess();
		});
	}

	return (
		<ConfirmModal
			opened={opened}
			title="Reset repetitions"
			confirmLabel="Reset repetitions"
			confirmColor="red"
			onConfirm={handleConfirm}
			onClose={onClose}>
			<Text>
				The scheduling progress for the {elementIds.length} selected
				element{elementIds.length === 1 ? "" : "s"} will be discarded,
				and they will behave as never studied. Their review history is
				kept.
			</Text>
		</ConfirmModal>
	);
}
