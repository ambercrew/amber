import { NumberInput, Stack } from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import FieldLabel from "../../../../components/FieldLabel/FieldLabel";
import { ProfileFormValues } from "./profileFormValues";

interface LearningAssetsAndExtractsTabProps {
	form: UseFormReturnType<ProfileFormValues>;
}

/** When learning assets and extracts come back into the queue. */
function LearningAssetsAndExtractsTab({
	form,
}: LearningAssetsAndExtractsTabProps) {
	return (
		<Stack gap="sm">
			<NumberInput
				label={
					<FieldLabel
						label="Initial interval (days)"
						tooltip="Days until the first due date for learning assets, extracts and cards created under this profile."
					/>
				}
				min={0}
				step={1}
				{...form.getInputProps("initialIntervalDays")}
			/>
			<NumberInput
				label={
					<FieldLabel
						label="Initial interval multiplier"
						tooltip="Starting multiplier applied to the interval each time an incremental learning asset or extract is revisited. Copied onto each learning asset/extract when it's created; editing this afterwards only affects newly created ones."
					/>
				}
				min={0}
				step={0.1}
				decimalScale={2}
				{...form.getInputProps("initialIntervalMultiplier")}
			/>
			<NumberInput
				label={
					<FieldLabel
						label="Min interval (days)"
						tooltip="Floor applied to computed intervals, so incremental learning asset items are never scheduled sooner than this."
					/>
				}
				min={0}
				step={1}
				{...form.getInputProps("minIntervalDays")}
			/>
		</Stack>
	);
}

export default LearningAssetsAndExtractsTab;
