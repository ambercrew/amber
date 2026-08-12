import { Select } from "@mantine/core";
import { useState } from "react";
import ConfirmModal from "../../../../../components/AppModal/ConfirmModal";
import { assignBibliographicalSourceBulk } from "../../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { BibliographicalSourceResponseDto } from "../../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { ElementId } from "../../../../../types/elements/elementId";
import { BulkCallApi } from "../bulkCallApi";

const NONE_VALUE = "__none__";

interface SetSourceModalProps {
	opened: boolean;
	elementIds: ElementId[];
	sources: BibliographicalSourceResponseDto[];
	callApi: BulkCallApi;
	onClose: () => void;
	onSuccess: () => void;
}

export default function SetSourceModal({
	opened,
	elementIds,
	sources,
	callApi,
	onClose,
	onSuccess,
}: SetSourceModalProps) {
	const [value, setValue] = useState<string>(NONE_VALUE);

	function handleSave() {
		void callApi(async () => {
			const sourceId = value === NONE_VALUE ? null : value;
			await assignBibliographicalSourceBulk(elementIds, sourceId);
			onSuccess();
		});
	}

	return (
		<ConfirmModal
			opened={opened}
			title="Set source"
			confirmLabel="Save"
			onConfirm={handleSave}
			onClose={onClose}>
			<Select
				value={value}
				onChange={next => setValue(next ?? NONE_VALUE)}
				data={[
					{ value: NONE_VALUE, label: "None" },
					...sources.map(source => ({
						value: source.id,
						label: source.title,
					})),
				]}
			/>
		</ConfirmModal>
	);
}
