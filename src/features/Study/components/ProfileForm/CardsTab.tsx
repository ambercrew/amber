import { NumberInput, Stack, Textarea, TextInput } from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import FieldLabel from "../../../../components/FieldLabel/FieldLabel";
import { ProfileFormValues } from "./profileFormValues";

interface CardsTabProps {
	form: UseFormReturnType<ProfileFormValues>;
}

/** How cards and clozes are reviewed, using FSRS. */
function CardsTab({ form }: CardsTabProps) {
	return (
		<Stack gap="sm">
			<NumberInput
				label={
					<FieldLabel
						label="Desired retention"
						tooltip="The probability of recall FSRS aims for when scheduling cards. Higher retention means more frequent reviews."
					/>
				}
				min={0.7}
				max={0.99}
				step={0.01}
				decimalScale={2}
				{...form.getInputProps("desiredRetention")}
			/>
			<Textarea
				label={
					<FieldLabel
						label="FSRS weights"
						tooltip="Advanced: the FSRS model weights used to schedule cards. Leave as-is unless you know what you're doing."
					/>
				}
				autosize
				minRows={2}
				{...form.getInputProps("fsrsParams")}
			/>
			<TextInput
				label={
					<FieldLabel
						label="Learning steps"
						tooltip="Same-day intervals a new card repeats before entering the long-term review schedule, separated by spaces (e.g. 1m 10m). Leave empty to use the default steps."
					/>
				}
				placeholder="1m 10m"
				{...form.getInputProps("learningSteps")}
			/>
			<TextInput
				label={
					<FieldLabel
						label="Relearning steps"
						tooltip="Same-day intervals a card repeats after being rated Again before returning to the long-term review schedule, separated by spaces (e.g. 10m). Leave empty to use the default steps."
					/>
				}
				placeholder="10m"
				{...form.getInputProps("relearningSteps")}
			/>
		</Stack>
	);
}

export default CardsTab;
