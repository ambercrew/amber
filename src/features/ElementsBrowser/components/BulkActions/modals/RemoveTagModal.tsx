import { MultiSelect } from "@mantine/core";
import { useMemo, useState } from "react";
import ConfirmModal from "../../../../../components/AppModal/ConfirmModal";
import { removeTagBulk } from "../../../../../api/elements/api/elementsApi";
import { SearchElementResultDto } from "../../../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../../../types/elements/elementId";
import { BulkCallApi } from "../bulkCallApi";

interface RemoveTagModalProps {
	opened: boolean;
	elementIds: ElementId[];
	selectedResults: SearchElementResultDto[];
	callApi: BulkCallApi;
	onClose: () => void;
	onSuccess: () => void;
}

export default function RemoveTagModal({
	opened,
	elementIds,
	selectedResults,
	callApi,
	onClose,
	onSuccess,
}: RemoveTagModalProps) {
	const [tags, setTags] = useState<string[]>([]);

	const availableTags = useMemo(() => {
		const names = new Set<string>();
		for (const result of selectedResults) {
			for (const tag of result.tags) names.add(tag.name);
		}
		return Array.from(names).sort();
	}, [selectedResults]);

	function handleSave() {
		void callApi(async () => {
			await removeTagBulk(elementIds, tags);
			onSuccess();
		});
	}

	return (
		<ConfirmModal
			opened={opened}
			title="Remove tag"
			confirmLabel="Save"
			confirmDisabled={tags.length === 0}
			onConfirm={handleSave}
			onClose={onClose}>
			<MultiSelect
				placeholder="Select tags to remove"
				data={availableTags}
				value={tags}
				onChange={setTags}
				searchable
				nothingFoundMessage="No tags among the selected elements"
			/>
		</ConfirmModal>
	);
}
