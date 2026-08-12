import { TagsInput } from "@mantine/core";
import { useState } from "react";
import ConfirmModal from "../../../../../components/AppModal/ConfirmModal";
import { addTagBulk } from "../../../../../api/elements/api/elementsApi";
import { ElementId } from "../../../../../types/elements/elementId";
import { BulkCallApi } from "../bulkCallApi";

interface AddTagModalProps {
	opened: boolean;
	elementIds: ElementId[];
	callApi: BulkCallApi;
	onClose: () => void;
	onSuccess: () => void;
}

export default function AddTagModal({
	opened,
	elementIds,
	callApi,
	onClose,
	onSuccess,
}: AddTagModalProps) {
	const [tags, setTags] = useState<string[]>([]);

	function handleSave() {
		void callApi(async () => {
			await addTagBulk(elementIds, tags);
			onSuccess();
		});
	}

	return (
		<ConfirmModal
			opened={opened}
			title="Add tag"
			confirmLabel="Save"
			confirmDisabled={tags.length === 0}
			onConfirm={handleSave}
			onClose={onClose}>
			<TagsInput
				placeholder="Enter tag"
				value={tags}
				onChange={setTags}
			/>
		</ConfirmModal>
	);
}
