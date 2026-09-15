import { useState } from "react";
import {
	Collapse,
	Group,
	Loader,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import PrioritySlider from "../../../components/PrioritySlider/PrioritySlider";
import { usePriorityControls } from "../../../components/PrioritySlider/usePriorityControls";
import { positionToPercentile } from "../../../components/PrioritySlider/priorityMath";

interface ImportPrioritySectionProps {
	/** Queue size the new element would join, including itself, or `null`
	 * while that's still being fetched. */
	total: number | null;
	position: number | null;
	onPositionChange: (position: number) => void;
}

/** Collapsible "Priority" section for the import modal — new imports default
 * to the middle of the queue rather than always jumping the line, but this
 * lets the user override that before importing. */
function ImportPrioritySection({
	total,
	position,
	onPositionChange,
}: ImportPrioritySectionProps) {
	const [opened, setOpened] = useState(false);

	return (
		<Stack gap="xs">
			<UnstyledButton onClick={() => setOpened(o => !o)}>
				<Group gap="xs">
					{opened ? (
						<CaretDownIcon size={14} />
					) : (
						<CaretRightIcon size={14} />
					)}
					<Text size="sm" fw={600}>
						Priority
					</Text>
				</Group>
			</UnstyledButton>
			<Collapse expanded={opened}>
				{total === null || position === null ? (
					<Loader size="xs" />
				) : (
					<PrioritySliderControlled
						total={total}
						position={position}
						onPositionChange={onPositionChange}
					/>
				)}
			</Collapse>
		</Stack>
	);
}

interface PrioritySliderControlledProps {
	total: number;
	position: number;
	onPositionChange: (position: number) => void;
}

/** Bridges the create-time `total`/`position` pair (no element id to persist
 * against yet) to the shared `PrioritySlider` controls. */
function PrioritySliderControlled({
	total,
	position,
	onPositionChange,
}: PrioritySliderControlledProps) {
	const controls = usePriorityControls({
		total,
		initialPosition: position,
		initialPercentile: positionToPercentile(total, position),
		onPositionCommit: newPosition => onPositionChange(newPosition),
		onPercentileCommit: (_percentile, newPosition) =>
			onPositionChange(newPosition),
	});

	return (
		<PrioritySlider
			total={total}
			position={controls.position}
			percentile={controls.percentile}
			percentileStep={controls.percentileStep}
			onPositionChange={controls.handlePositionChange}
			onPercentileChange={controls.handlePercentileChange}
			onSliderChange={controls.handleSliderChange}
			onSliderChangeEnd={controls.handleSliderChangeEnd}
		/>
	);
}

export default ImportPrioritySection;
