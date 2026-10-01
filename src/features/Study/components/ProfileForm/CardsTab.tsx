import {
	Button,
	Group,
	NumberInput,
	Stack,
	Text,
	Textarea,
	TextInput,
} from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import { MagicWandIcon } from "@phosphor-icons/react";
import FieldLabel from "../../../../components/FieldLabel/FieldLabel";
import { ProfileFormValues } from "./profileFormValues";
import { FsrsOptimization } from "./useFsrsOptimization";

interface CardsTabProps {
	form: UseFormReturnType<ProfileFormValues>;
	/** `null` while creating a profile, which has no review history to optimize on. */
	optimization: FsrsOptimization | null;
}

/** How cards and clozes are reviewed, using FSRS. */
function CardsTab({ form, optimization }: CardsTabProps) {
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
			<Stack gap={4}>
				<Textarea
					label={
						<FieldLabel
							label="FSRS weights"
							tooltip="Advanced: the FSRS model weights used to schedule cards. Leave as-is unless you know what you're doing, or use Optimize to train them on your own review history."
						/>
					}
					autosize
					minRows={2}
					// Locked while optimizing so the result can't overwrite an edit.
					disabled={optimization?.isOptimizing}
					{...form.getInputProps("fsrsParams")}
				/>
				{optimization && (
					<Group gap="xs" wrap="nowrap">
						<Button
							type="button"
							variant="default"
							size="xs"
							leftSection={<MagicWandIcon />}
							loading={optimization.isOptimizing}
							onClick={() => void optimization.optimize()}>
							Optimize
						</Button>
						{optimization.errorMessage && (
							<Text size="xs" c="red">
								{optimization.errorMessage}
							</Text>
						)}
						{optimization.reviewCount !== null && (
							<Text size="xs" c="dimmed">
								Trained on {optimization.reviewCount} reviews.
								Save to apply.
							</Text>
						)}
					</Group>
				)}
			</Stack>
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
