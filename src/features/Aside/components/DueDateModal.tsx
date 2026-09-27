import { useState } from "react";
import { Button, Center, Group, Loader, Text } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import AppModal from "../../../components/AppModal/AppModal";
import { setElementDue } from "../../../api/study/api/studyApi";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeDueDateModal } from "../../../stores/app/appReducer";
import { selectIsDueDateModalOpened } from "../../../stores/app/appSelectors";
import { loadElementDetailsAction } from "../../../stores/elementDetails/elementDetailsActions";
import { selectCurrentElementDetails } from "../../../stores/elementDetails/elementDetailsSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import { ElementId } from "../../../types/elements/elementId";
import {
	fromDateInputValue,
	toDateInputValue,
} from "../../../utils/dateInputValue";
import { dueDateTimePickerInModalProps } from "../../../utils/dueDateTimePickerProps";
import { dueIsoFor } from "../../../utils/elementDue";

interface DueDateModalBodyProps {
	elementId: ElementId;
	due: string | null;
	onClose: () => void;
}

function DueDateModalBody({ elementId, due, onClose }: DueDateModalBodyProps) {
	const dispatch = useAppDispatch();
	const { callApi, isSendingRequest, errorMessage } = useApi();
	const [value, setValue] = useState<string | null>(() =>
		toDateInputValue(due),
	);

	function handleSave() {
		if (!value) return;
		void callApi(async () => {
			await setElementDue(elementId, fromDateInputValue(value));
			void dispatch(loadElementDetailsAction(elementId));
			onClose();
		});
	}

	return (
		<>
			<DateTimePicker
				label="Due"
				placeholder="Pick a date and time"
				value={value}
				onChange={setValue}
				data-autofocus
				{...dueDateTimePickerInModalProps}
			/>
			{errorMessage && (
				<Text size="sm" c="red" mt="xs">
					{errorMessage}
				</Text>
			)}
			<Group justify="flex-end" gap="xs" mt="sm">
				<Button variant="default" onClick={onClose}>
					Cancel
				</Button>
				<Button
					disabled={!value}
					loading={isSendingRequest}
					onClick={handleSave}>
					Save
				</Button>
			</Group>
		</>
	);
}

/** Picks a specific due date for the current element. */
function DueDateModal() {
	const opened = useAppSelector(selectIsDueDateModalOpened);
	const currentElement = useAppSelector(selectCurrentElement);
	const details = useAppSelector(selectCurrentElementDetails);
	const dispatch = useAppDispatch();
	const elementId = currentElement?.data.meta.elementId ?? null;
	const due = dueIsoFor(details);
	const onClose = () => dispatch(closeDueDateModal());

	return (
		<AppModal opened={opened} onClose={onClose} title="Set due date">
			{/* Waits for details so a loaded due can't reset a date already picked. */}
			{elementId &&
				(details ? (
					<DueDateModalBody
						key={elementId.id}
						elementId={elementId}
						due={due}
						onClose={onClose}
					/>
				) : (
					<Center py="md">
						<Loader size="sm" />
					</Center>
				))}
		</AppModal>
	);
}

export default DueDateModal;
