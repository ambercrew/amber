import { Select } from "@mantine/core";
import { useState } from "react";
import ConfirmModal from "../../../../../components/AppModal/ConfirmModal";
import { assignStudyProfileBulk } from "../../../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../../../api/study/dto/studyProfileDto";
import { ElementId } from "../../../../../types/elements/elementId";
import { BulkCallApi } from "../bulkCallApi";

const INHERIT_VALUE = "__inherit__";

interface SetStudyProfileModalProps {
	opened: boolean;
	elementIds: ElementId[];
	profiles: StudyProfileDto[];
	callApi: BulkCallApi;
	onClose: () => void;
	onSuccess: () => void;
}

export default function SetStudyProfileModal({
	opened,
	elementIds,
	profiles,
	callApi,
	onClose,
	onSuccess,
}: SetStudyProfileModalProps) {
	const [value, setValue] = useState<string>(INHERIT_VALUE);

	function handleSave() {
		void callApi(async () => {
			const profileId = value === INHERIT_VALUE ? null : value;
			await assignStudyProfileBulk(elementIds, profileId);
			onSuccess();
		});
	}

	return (
		<ConfirmModal
			opened={opened}
			title="Set study profile"
			confirmLabel="Save"
			onConfirm={handleSave}
			onClose={onClose}>
			<Select
				value={value}
				onChange={next => setValue(next ?? INHERIT_VALUE)}
				data={[
					{ value: INHERIT_VALUE, label: "Inherit from parent" },
					...profiles.map(profile => ({
						value: profile.id,
						label: profile.name,
					})),
				]}
			/>
		</ConfirmModal>
	);
}
