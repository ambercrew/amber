import { DateTimePicker } from "@mantine/dates";
import { setElementDue } from "../../../api/study/api/studyApi";
import useOptimisticField from "../../../hooks/useOptimisticField";
import { ElementId } from "../../../types/elements/elementId";
import {
	fromDateInputValue,
	toDateInputValue,
} from "../../../utils/dateInputValue";
import { dueDateTimePickerProps } from "../../../utils/dueDateTimePickerProps";

interface DueDateInputProps {
	elementId: ElementId;
	due: string | null;
	size?: "xs" | "sm";
	ariaLabel?: string;
	description?: string;
	onChanged?: (due: string) => void;
}

function DueDateInput({
	elementId,
	due,
	size = "sm",
	ariaLabel = "Due",
	description,
	onChanged,
}: DueDateInputProps) {
	const { value, setValue, persist, errorMessage } = useOptimisticField(
		toDateInputValue(due),
	);

	function handleClose() {
		if (!value || value === toDateInputValue(due)) return;
		const iso = fromDateInputValue(value);
		persist(value, async () => {
			await setElementDue(elementId, iso);
			onChanged?.(iso);
		});
	}

	return (
		<DateTimePicker
			size={size}
			w="100%"
			aria-label={ariaLabel}
			placeholder="—"
			value={value}
			onChange={next => {
				if (next) setValue(next);
			}}
			onDropdownClose={handleClose}
			description={description}
			error={errorMessage}
			{...dueDateTimePickerProps}
		/>
	);
}

export default DueDateInput;
