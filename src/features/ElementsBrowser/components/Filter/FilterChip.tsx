import { KeyboardEvent, useState } from "react";
import { Box, Group, Pill, Popover, Text } from "@mantine/core";
import { ElementFilter } from "../../../../api/savedSearches/dto/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import { getFilterFieldMeta } from "../../utils/filterFieldMeta";
import { describeFilter } from "../../utils/filterDisplay";
import FilterEditor from "./FilterEditor";
import useElementName from "../../../../hooks/useElementName";

export default function FilterChip({
	filter,
	sources,
	profiles,
	defaultOpened,
	onChange,
	onRemove,
}: {
	filter: ElementFilter;
	sources: BibliographicalSourceResponseDto[];
	profiles: StudyProfileDto[];
	defaultOpened?: boolean;
	onChange: (filter: ElementFilter) => void;
	onRemove: () => void;
}) {
	const [opened, setOpened] = useState(defaultOpened ?? false);
	const meta = getFilterFieldMeta(filter.field);
	const ancestor = useElementName(
		filter.field === "descendantOf" ? filter.ancestor : null,
	);
	const { fieldLabel, operatorLabel, valueLabel } = describeFilter(
		filter,
		sources,
		profiles,
		ancestor,
	);

	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		// Ignore keys bubbling up from the remove button inside the chip.
		if (event.target !== event.currentTarget) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			setOpened(o => !o);
		}
	}

	return (
		<Popover
			position="bottom-start"
			shadow="md"
			opened={opened}
			onChange={setOpened}
			// Focuses the editor's `data-autofocus` field on open and keeps Tab inside.
			trapFocus
			returnFocus
			withinPortal>
			<Popover.Target>
				<Pill
					role="button"
					tabIndex={0}
					aria-label={`Edit ${meta.label} filter`}
					onClick={() => setOpened(o => !o)}
					onKeyDown={handleKeyDown}
					size="xl"
					withRemoveButton
					onRemove={onRemove}
					removeButtonProps={{
						// Mantine takes the remove button out of the tab order by default.
						tabIndex: 0,
						"aria-hidden": false,
						"aria-label": `Remove ${meta.label} filter`,
					}}
					styles={{
						label: {
							display: "flex",
							alignItems: "center",
						},
					}}
					style={{
						cursor: "pointer",
						background: "var(--mantine-color-blue-light)",
						color: "var(--mantine-color-blue-light-color)",
					}}>
					<Group
						gap={6}
						wrap="nowrap"
						align="center"
						style={{ minWidth: 0 }}>
						<Box
							style={{
								flexShrink: 0,
								display: "flex",
								alignItems: "center",
							}}>
							{meta.icon(16)}
						</Box>
						<Text fw={600} style={{ flexShrink: 0 }}>
							{fieldLabel ?? meta.label}
						</Text>
						{operatorLabel && (
							<Text style={{ flexShrink: 0 }}>
								{operatorLabel}
							</Text>
						)}
						{valueLabel && (
							<Text fw={600} truncate style={{ minWidth: 0 }}>
								{valueLabel}
							</Text>
						)}
					</Group>
				</Pill>
			</Popover.Target>
			<Popover.Dropdown>
				<FilterEditor
					filter={filter}
					sources={sources}
					profiles={profiles}
					onChange={onChange}
				/>
			</Popover.Dropdown>
		</Popover>
	);
}
