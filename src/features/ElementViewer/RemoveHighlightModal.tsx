import { Text } from "@mantine/core";
import ConfirmModal from "../../components/AppModal/ConfirmModal";
import { PendingHighlightRemoval } from "./hooks/useElementViewerButtons";

interface RemoveHighlightModalProps {
	removal: PendingHighlightRemoval | null;
	onConfirm: () => void;
	onClose: () => void;
}

export default function RemoveHighlightModal({
	removal,
	onConfirm,
	onClose,
}: RemoveHighlightModalProps) {
	const count = removal?.elementIds.length ?? 0;

	return (
		<ConfirmModal
			opened={removal !== null}
			title="Remove highlight"
			confirmLabel="Remove"
			confirmColor="red"
			onConfirm={onConfirm}
			onClose={onClose}>
			<Text>
				{count === 1
					? "1 element created from this highlight"
					: `${count} elements created from these highlights`}{" "}
				will be moved to the trash, where you can restore{" "}
				{count === 1 ? "it" : "them"} until purged.
			</Text>
		</ConfirmModal>
	);
}
