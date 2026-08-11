import { Button, Group, MultiSelect } from "@mantine/core";
import { useMemo, useState } from "react";
import AppModal from "../../../../../components/AppModal/AppModal";
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
		if (tags.length === 0) return;
		void callApi(async () => {
			await removeTagBulk(elementIds, tags);
			onSuccess();
		});
	}

	return (
		<AppModal opened={opened} onClose={onClose} title="Remove tag">
			<MultiSelect
				placeholder="Select tags to remove"
				data={availableTags}
				value={tags}
				onChange={setTags}
				searchable
				nothingFoundMessage="No tags among the selected elements"
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
