import { Checkbox, NumberInput, Select, Stack } from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import FieldLabel from "../../../../components/FieldLabel/FieldLabel";
import {
	CEILING_TOOLTIP,
	PLACEMENT_OPTIONS,
	PLACEMENT_PERCENTILE_LABELS,
	PLACEMENT_TOOLTIP,
	ProfileFormValues,
} from "./profileFormValues";

interface QueueTabProps {
	form: UseFormReturnType<ProfileFormValues>;
}

/** Where new extracts and cards land in the priority queue. */
function QueueTab({ form }: QueueTabProps) {
	const placementType = form.values.placementType;
	const percentileLabel = PLACEMENT_PERCENTILE_LABELS[placementType];
	const placementPercentileTooltip =
		placementType === "offsetFromParent"
			? "Percentile points added to the parent's own percentile, clamped to the queue. A positive offset places the new element behind its parent."
			: "The percentile every new element is placed at, regardless of its parent.";
	// A fixed percentile already names an absolute spot, so a cap on it would
	// only ever restate that spot.
	const supportsCeiling = placementType !== "fixedPercentile";

	return (
		<Stack gap="sm">
			<Select
				label={
					<FieldLabel
						label="Placement policy"
						tooltip={PLACEMENT_TOOLTIP}
					/>
				}
				data={PLACEMENT_OPTIONS}
				allowDeselect={false}
				withAlignedLabels
				{...form.getInputProps("placementType")}
			/>
			{percentileLabel && (
				<NumberInput
					label={
						<FieldLabel
							label={percentileLabel}
							tooltip={placementPercentileTooltip}
						/>
					}
					min={placementType === "offsetFromParent" ? -100 : 0}
					max={100}
					step={5}
					{...form.getInputProps("placementPercentile")}
				/>
			)}
			{supportsCeiling && (
				<>
					<Checkbox
						label={
							<FieldLabel
								label="Cap priority"
								tooltip={CEILING_TOOLTIP}
							/>
						}
						{...form.getInputProps("capPriority", {
							type: "checkbox",
						})}
					/>
					<NumberInput
						label={
							<FieldLabel
								label="Ceiling (percentile)"
								tooltip={CEILING_TOOLTIP}
							/>
						}
						disabled={!form.values.capPriority}
						min={0}
						max={100}
						step={5}
						{...form.getInputProps("ceilingPercentile")}
					/>
				</>
			)}
		</Stack>
	);
}

export default QueueTab;
