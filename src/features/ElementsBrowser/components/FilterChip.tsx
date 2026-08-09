import { Box, Group, Pill, Popover, Text } from "@mantine/core";
import { ElementFilter } from "../../../types/elements/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import { getFilterFieldMeta } from "../utils/filterFieldMeta";
import { describeFilter } from "../utils/filterDisplay";
import FilterEditor from "./FilterEditor";

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
	const meta = getFilterFieldMeta(filter.field);
	const { operatorLabel, valueLabel } = describeFilter(
		filter,
		sources,
		profiles,
	);

	return (
		<Popover
			position="bottom-start"
			shadow="md"
			defaultOpened={defaultOpened}
			withinPortal>
			<Popover.Target>
				<Pill
					size="xl"
					withRemoveButton
					onRemove={onRemove}
					removeButtonProps={{
						"aria-hidden": false,
						"aria-label": `Remove ${meta.label} filter`,
					}}
					style={{
						cursor: "pointer",
						background: "var(--mantine-color-blue-light)",
						color: "var(--mantine-color-blue-light-color)",
					}}>
					<Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
						<Box style={{ flexShrink: 0, display: "flex" }}>
							{meta.icon(16)}
						</Box>
						<Text fw={600} style={{ flexShrink: 0 }}>
							{meta.label}
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
