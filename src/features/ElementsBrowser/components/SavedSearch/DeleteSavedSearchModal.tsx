import { Text } from "@mantine/core";
import ConfirmModal from "../../../../components/AppModal/ConfirmModal";

interface DeleteSavedSearchModalProps {
	opened: boolean;
	savedSearchName: string;
	onConfirm: () => void;
	onClose: () => void;
}

function DeleteSavedSearchModal({
	opened,
	savedSearchName,
	onConfirm,
	onClose,
}: DeleteSavedSearchModalProps) {
	return (
		<ConfirmModal
			opened={opened}
			title="Delete saved search"
			confirmLabel="Delete"
			confirmColor="red"
			onConfirm={onConfirm}
			onClose={onClose}>
			<Text>
				&quot;{savedSearchName}&quot; will be permanently deleted. This
				cannot be undone.
			</Text>
		</ConfirmModal>
	);
}

export default DeleteSavedSearchModal;
