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
import { rankToPercentage } from "../../../components/PrioritySlider/priorityMath";

interface ImportPrioritySectionProps {
	/** Queue size the new element would join, including itself, or `null`
	 * while that's still being fetched. */
	total: number | null;
	rank: number | null;
	onRankChange: (rank: number) => void;
}

/** Collapsible "Priority" section for the import modal — new imports default
 * to the middle of the queue rather than always jumping the line, but this
 * lets the user override that before importing. */
function ImportPrioritySection({
	total,
	rank,
	onRankChange,
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
				{total === null || rank === null ? (
					<Loader size="xs" />
				) : (
					<PrioritySliderControlled
						total={total}
						rank={rank}
						onRankChange={onRankChange}
					/>
				)}
			</Collapse>
		</Stack>
	);
}

interface PrioritySliderControlledProps {
	total: number;
	rank: number;
	onRankChange: (rank: number) => void;
}

/** Bridges the create-time `total`/`rank` pair (no element id to persist
 * against yet) to the shared `PrioritySlider` controls. */
function PrioritySliderControlled({
	total,
	rank,
	onRankChange,
}: PrioritySliderControlledProps) {
	const controls = usePriorityControls({
		total,
		initialRank: rank,
		initialPercentage: rankToPercentage(total, rank),
		onRankCommit: newRank => onRankChange(newRank),
		onPercentageCommit: (_percentage, newRank) => onRankChange(newRank),
	});

	return (
		<PrioritySlider
			total={total}
			rank={controls.rank}
			percentage={controls.percentage}
			percentageStep={controls.percentageStep}
			onRankChange={controls.handleRankChange}
			onPercentageChange={controls.handlePercentageChange}
			onSliderChange={controls.handleSliderChange}
			onSliderChangeEnd={controls.handleSliderChangeEnd}
		/>
	);
}

export default ImportPrioritySection;
