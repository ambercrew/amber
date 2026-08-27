import { DateTimePicker } from "@mantine/dates";
import { useEffect, useState } from "react";
import ConfirmModal from "../../../../../components/AppModal/ConfirmModal";
import { setElementDueBulk } from "../../../../../api/study/api/studyApi";
import { ElementId } from "../../../../../types/elements/elementId";
import {
	fromDateInputValue,
	toDateInputValue,
} from "../../../../../utils/dateInputValue";
import { dueDateTimePickerProps } from "../../../../../utils/dueDateTimePickerProps";
import { BulkCallApi } from "../bulkCallApi";

interface SetDueDateModalProps {
	opened: boolean;
	elementIds: ElementId[];
	/** Due date to prefill the picker with, e.g. the first selected item's. */
	defaultDue?: string | null;
	callApi: BulkCallApi;
	onClose: () => void;
	onSuccess: () => void;
}

export default function SetDueDateModal({
	opened,
	elementIds,
	defaultDue = null,
	callApi,
	onClose,
	onSuccess,
}: SetDueDateModalProps) {
	const [value, setValue] = useState<string | null>(null);

	useEffect(() => {
		if (opened) setValue(toDateInputValue(defaultDue));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [opened]);

	function handleSave() {
		if (!value) return;
		void callApi(async () => {
			await setElementDueBulk(elementIds, fromDateInputValue(value));
			onSuccess();
		});
	}

	return (
		<ConfirmModal
			opened={opened}
			title="Set due date"
			confirmLabel="Save"
			confirmDisabled={!value}
			onConfirm={handleSave}
			onClose={onClose}>
			<DateTimePicker
				label="Due"
				placeholder="Pick a date and time"
				value={value}
				onChange={setValue}
				{...dueDateTimePickerProps}
			/>
		</ConfirmModal>
	);
}
