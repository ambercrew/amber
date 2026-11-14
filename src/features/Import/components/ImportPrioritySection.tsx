import { useState } from "react";
import {
	Box,
	Collapse,
	Group,
	Loader,
	Text,
	UnstyledButton,
} from "@mantine/core";
import ImportField from "./ImportField";
import PrioritySlider from "../../../components/PrioritySlider/PrioritySlider";
import { usePriorityControls } from "../../../components/PrioritySlider/usePriorityControls";
import { positionToPercentile } from "../../../components/PrioritySlider/priorityMath";
import { PlacedElement } from "../../../components/PrioritySlider/PriorityNeighborsPreview";
import DisclosureCaret from "../../../components/DisclosureCaret/DisclosureCaret";
import { formatPriorityPercentile } from "../../../utils/formatPriorityPercentile";

// Imports always create a learning asset, which has no name until it's created.
const IMPORTED_ELEMENT: PlacedElement = {
	id: null,
	type: "learningAsset",
	name: "This import",
};

const BORDER = "1px solid var(--mantine-color-default-border)";

interface ImportPrioritySectionProps {
	/** Queue size the new element would join, including itself, or `null`
	 * while that's still being fetched. */
	total: number | null;
	position: number | null;
	/** How many elements the import creates, one after another from `position`. */
	count: number;
	onPositionChange: (position: number) => void;
}

function positionsLabel(position: number, count: number): string {
	if (count <= 1) return `position ${position.toLocaleString()}`;
	const last = position + count - 1;
	return `positions ${position.toLocaleString()}–${last.toLocaleString()}`;
}

/** The import modal's priority row: a summary of where imports land, expanding into the slider. */
function ImportPrioritySection({
	total,
	position,
	count,
	onPositionChange,
}: ImportPrioritySectionProps) {
	const [opened, setOpened] = useState(false);
	const loaded = total !== null && position !== null;

	return (
		<ImportField label="Priority">
			<Box
				bd={BORDER}
				style={{ borderRadius: "var(--mantine-radius-sm)" }}>
				<UnstyledButton
					w="100%"
					px="sm"
					py={7}
					aria-expanded={opened}
					onClick={() => setOpened(o => !o)}>
					<Group justify="space-between" wrap="nowrap" gap="xs">
						{loaded ? (
							<Text size="sm" truncate>
								<Text span size="sm" fw={600}>
									{formatPriorityPercentile(
										positionToPercentile(total, position),
									)}
								</Text>{" "}
								· {positionsLabel(position, count)} of{" "}
								{(
									total +
									Math.max(count, 1) -
									1
								).toLocaleString()}
							</Text>
						) : (
							<Loader size="xs" />
						)}
						<Group
							gap={4}
							wrap="nowrap"
							c="var(--mantine-primary-color-light-color)">
							<Text size="sm" c="inherit">
								Change
							</Text>
							<DisclosureCaret opened={opened} size={14} />
						</Group>
					</Group>
				</UnstyledButton>
				<Collapse expanded={opened}>
					<Box p="sm" style={{ borderTop: BORDER }}>
						{loaded ? (
							<PrioritySliderControlled
								total={total}
								position={position}
								onPositionChange={onPositionChange}
							/>
						) : (
							<Loader size="xs" />
						)}
					</Box>
				</Collapse>
			</Box>
		</ImportField>
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
			element={IMPORTED_ELEMENT}
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
