import { Button, Group, TagsInput } from "@mantine/core";
import { useState } from "react";
import AppModal from "../../../../../components/AppModal/AppModal";
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
		if (tags.length === 0) return;
		void callApi(async () => {
			await addTagBulk(elementIds, tags);
			onSuccess();
		});
	}

	// TODO: in this and other use confirm modal
	return (
		<AppModal opened={opened} onClose={onClose} title="Add tag">
			<TagsInput
				placeholder="Enter tag"
				value={tags}
				onChange={setTags}
			/>
			<Group justify="flex-end" gap="xs" mt="sm">
				<Button variant="default" onClick={onClose}>
					Cancel
				</Button>
				<Button disabled={tags.length === 0} onClick={handleSave}>
					Save
				</Button>
			</Group>
		</AppModal>
	);
}
