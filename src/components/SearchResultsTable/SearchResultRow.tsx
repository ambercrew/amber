import { Anchor, Badge, Box, Checkbox, Group, Table } from "@mantine/core";
import { memo, Ref } from "react";
import { Link } from "react-router";
import { SearchElementResultDto } from "../../api/search/dto/searchElementResultDto";
import ElementNodeIcon from "../ElementNodeIcon/ElementNodeIcon";
import { paths } from "../../paths";
import { elementTypeOptions } from "../../utils/elementTypeOptions";
import { formatPriorityPercentile } from "../../utils/formatPriorityPercentile";

function elementTypeLabel(type: SearchElementResultDto["type"]): string {
	return (
		elementTypeOptions.find(option => option.value === type)?.label ?? type
	);
}

function formatDateTime(value: string | null): string {
	return value ? new Date(value).toLocaleString() : "—";
}

interface SearchResultRowProps {
	result: SearchElementResultDto;
	index: number;
	selectable: boolean;
	selected: boolean;
	onToggle: (
		result: SearchElementResultDto,
		index: number,
		shiftKey: boolean,
	) => void;
	rowRef: Ref<HTMLTableRowElement>;
}

function SearchResultRow({
	result,
	index,
	selectable,
	selected,
	onToggle,
	rowRef,
}: SearchResultRowProps) {
	return (
		// The header is row 1, and only some rows exist in the DOM.
		<Table.Tr ref={rowRef} data-index={index} aria-rowindex={index + 2}>
			{selectable && (
				<Table.Td>
					<Checkbox
						aria-label={`Select ${result.name}`}
						checked={selected}
						onChange={event =>
							onToggle(
								result,
								index,
								(event.nativeEvent as MouseEvent).shiftKey,
							)
						}
					/>
				</Table.Td>
			)}
			<Table.Td>
				<Group gap="xs" wrap="nowrap">
					<Box flex="0 0 auto" display="flex">
						<ElementNodeIcon type={result.type} size={16} />
					</Box>
					<Anchor
						component={Link}
						to={paths.element(result.type, result.id)}
						size="sm"
						c="inherit"
						underline="hover"
						miw={0}
						style={{ overflowWrap: "anywhere" }}>
						{result.name}
					</Anchor>
				</Group>
			</Table.Td>
			<Table.Td>{elementTypeLabel(result.type)}</Table.Td>
			<Table.Td>
				{formatPriorityPercentile(result.priority.percentile)}
			</Table.Td>
			<Table.Td>{formatDateTime(result.due)}</Table.Td>
			<Table.Td>
				<Group gap={4} wrap="wrap">
					{result.tags.map(tag => (
						<Badge
							key={tag}
							variant="light"
							size="sm"
							maw="100%"
							title={tag}>
							{tag}
						</Badge>
					))}
				</Group>
			</Table.Td>
		</Table.Tr>
	);
}

// The list re-renders on every scroll step, which shouldn't reach rows that stay.
export default memo(SearchResultRow);
