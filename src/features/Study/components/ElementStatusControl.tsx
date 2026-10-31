import { Input, SegmentedControl } from "@mantine/core";
import { setElementsStatus } from "../../../api/study/api/studyApi";
import useOptimisticField from "../../../hooks/useOptimisticField";
import { ElementId } from "../../../types/elements/elementId";
import {
	ElementStatus,
	elementStatusOptions,
} from "../../../types/study/elementStatus";

interface ElementStatusControlProps {
	elementId: ElementId;
	status: ElementStatus;
}

function ElementStatusControl({
	elementId,
	status,
}: ElementStatusControlProps) {
	const { value, persist, errorMessage } = useOptimisticField(status);
	const options =
		elementId.type === "card"
			? elementStatusOptions.filter(option => option.value !== "finished")
			: elementStatusOptions;

	function handleChange(next: ElementStatus) {
		persist(next, async () => {
			await setElementsStatus([elementId], next);
			// A defined result tells useOptimisticField the change stuck.
			return next;
		});
	}

	return (
		<>
			<SegmentedControl
				size="xs"
				fullWidth
				aria-label="Status"
				styles={{
					root: { backgroundColor: "var(--sidebar-control-bg)" },
				}}
				data={options}
				value={value}
				onChange={next => handleChange(next as ElementStatus)}
			/>
			{errorMessage && <Input.Error>{errorMessage}</Input.Error>}
		</>
	);
}

export default ElementStatusControl;
