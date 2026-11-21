import {
	Button,
	Divider,
	Group,
	NumberInput,
	Select,
	SimpleGrid,
	Stack,
	Text,
	Textarea,
	TextInput,
} from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import { MagicWandIcon } from "@phosphor-icons/react";
import FieldLabel from "../../../../components/FieldLabel/FieldLabel";
import {
	DEFAULT_MAXIMUM_INTERVAL_DAYS,
	LEECH_ACTION_OPTIONS,
	MAX_LEECH_THRESHOLD,
	MAX_MAXIMUM_INTERVAL_DAYS,
	MAX_NEW_CARDS_PER_DAY,
	ProfileFormValues,
} from "./profileFormValues";
import { FsrsOptimization } from "./useFsrsOptimization";

interface CardsTabProps {
	form: UseFormReturnType<ProfileFormValues>;
	/** `null` while creating a profile, which has no review history to optimize on. */
	optimization: FsrsOptimization | null;
}

/** How cards and clozes are reviewed, using FSRS. */
function CardsTab({ form, optimization }: CardsTabProps) {
	return (
		<Stack gap="md">
			<Stack gap="sm">
				<Divider label="New cards" labelPosition="left" />
				<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
					<NumberInput
						label={
							<FieldLabel
								label="New cards per day"
								tooltip="The most new cards that can show up each day. A low number stops a big batch of new cards from piling up as reviews later on. Set to 0 to pause new cards."
							/>
						}
						min={0}
						max={MAX_NEW_CARDS_PER_DAY}
						step={1}
						allowDecimal={false}
						allowNegative={false}
						{...form.getInputProps("newCardsPerDay")}
					/>
					<TextInput
						label={
							<FieldLabel
								label="Learning steps"
								tooltip="Same-day intervals a new card repeats before entering the long-term review schedule, separated by spaces (e.g. 1m 10m). Leave empty to skip them and let FSRS schedule new cards directly."
							/>
						}
						placeholder="None"
						{...form.getInputProps("learningSteps")}
					/>
				</SimpleGrid>
			</Stack>
			<Stack gap="sm">
				<Divider label="Scheduling" labelPosition="left" />
				<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
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
					<NumberInput
						label={
							<FieldLabel
								label="Maximum interval (days)"
								tooltip={`The longest a card can go between reviews, however well you know it. The default, ${DEFAULT_MAXIMUM_INTERVAL_DAYS} days (100 years), leaves it to FSRS.`}
							/>
						}
						min={1}
						max={MAX_MAXIMUM_INTERVAL_DAYS}
						step={1}
						allowDecimal={false}
						allowNegative={false}
						{...form.getInputProps("maximumIntervalDays")}
					/>
				</SimpleGrid>
			</Stack>
			<Stack gap="sm">
				<Divider label="Forgotten cards" labelPosition="left" />
				<Stack gap="sm">
					<TextInput
						label={
							<FieldLabel
								label="Relearning steps"
								tooltip="Same-day intervals a card repeats after being rated Again before returning to the long-term review schedule, separated by spaces (e.g. 10m). Leave empty to skip them and let FSRS reschedule lapsed cards directly."
							/>
						}
						placeholder="None"
						{...form.getInputProps("relearningSteps")}
					/>
					<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
						<NumberInput
							label={
								<FieldLabel
									label="Leech threshold"
									tooltip="After you forget a card this many times, it's tagged “leech” and Amber offers you to rewrite it. With 8, that happens on the 8th time, then the 12th, 16th and so on. Set to 0 to turn it off."
								/>
							}
							min={0}
							max={MAX_LEECH_THRESHOLD}
							step={1}
							allowDecimal={false}
							allowNegative={false}
							{...form.getInputProps("leechThreshold")}
						/>
						<Select
							label={
								<FieldLabel
									label="Leech action"
									tooltip="What happens to a leech. Tag only: it keeps showing up in your reviews. Tag and suspend: it stops showing up until you set its status back to Active."
								/>
							}
							data={LEECH_ACTION_OPTIONS}
							allowDeselect={false}
							disabled={form.values.leechThreshold === 0}
							{...form.getInputProps("leechAction")}
						/>
					</SimpleGrid>
				</Stack>
			</Stack>
			<Stack gap="sm">
				<Divider label="Advanced" labelPosition="left" />
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
									Trained on {optimization.reviewCount}{" "}
									reviews. Save to apply.
								</Text>
							)}
						</Group>
					)}
				</Stack>
			</Stack>
		</Stack>
	);
}

export default CardsTab;
