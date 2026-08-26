import {
	Anchor,
	Badge,
	Box,
	Checkbox,
	Group,
	Table,
	Text,
} from "@mantine/core";
import { useRef } from "react";
import { Link } from "react-router";
import { SearchElementResultDto } from "../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../types/elements/elementId";
import { paths } from "../../../paths";
import { formatPriorityPercentage } from "../../../utils/formatPriorityPercentage";
import ElementNodeIcon from "../../App/components/ElementNodeIcon";
import { elementTypeOptions } from "../utils/elementTypeOptions";
import { elementKey } from "../utils/elementKey";

function elementTypeLabel(type: SearchElementResultDto["type"]): string {
	return (
		elementTypeOptions.find(option => option.value === type)?.label ?? type
	);
}

function formatDateTime(value: string | null): string {
	return value ? new Date(value).toLocaleString() : "—";
}

interface SearchResultsTableProps {
	results: SearchElementResultDto[];
	selectedIds: ElementId[];
	onSelectionChange: (ids: ElementId[]) => void;
}

export default function SearchResultsTable({
	results,
	selectedIds,
	onSelectionChange,
}: SearchResultsTableProps) {
	const shiftKeyRef = useRef(false);
	const lastClickedIndexRef = useRef<number | null>(null);

	if (results.length === 0) {
		return (
			<Text c="dimmed" size="sm" ta="center" py="md">
				No elements match the current filters.
			</Text>
		);
	}

	const selectedKeys = new Set(selectedIds.map(elementKey));
	const allSelected =
		results.length > 0 &&
		results.every(r => selectedKeys.has(elementKey(r)));
	const someSelected = results.some(r => selectedKeys.has(elementKey(r)));

	function toggleAll() {
		if (allSelected) {
			onSelectionChange([]);
		} else {
			onSelectionChange(results.map(r => ({ type: r.type, id: r.id })));
		}
	}

	function toggleOne(result: SearchElementResultDto, index: number) {
		const key = elementKey(result);
		const isSelected = selectedKeys.has(key);

		if (shiftKeyRef.current && lastClickedIndexRef.current !== null) {
			const [start, end] = [lastClickedIndexRef.current, index].sort(
				(a, b) => a - b,
			);
			const rangeKeys = new Set(
				results.slice(start, end + 1).map(elementKey),
			);
			const merged = new Map(selectedIds.map(id => [elementKey(id), id]));
			if (isSelected) {
				rangeKeys.forEach(rangeKey => merged.delete(rangeKey));
			} else {
				results.slice(start, end + 1).forEach(r => {
					merged.set(elementKey(r), { type: r.type, id: r.id });
				});
			}
			onSelectionChange([...merged.values()]);
		} else if (isSelected) {
			onSelectionChange(selectedIds.filter(id => elementKey(id) !== key));
		} else {
			onSelectionChange([
				...selectedIds,
				{ type: result.type, id: result.id },
			]);
		}

		lastClickedIndexRef.current = index;
	}

	return (
		<Table.ScrollContainer minWidth={550}>
			<Table striped highlightOnHover verticalSpacing="xs">
				<Table.Thead>
					<Table.Tr>
						<Table.Th>
							<Checkbox
								aria-label="Select all results"
								checked={allSelected}
								indeterminate={someSelected && !allSelected}
								onChange={toggleAll}
							/>
						</Table.Th>
						<Table.Th>Name</Table.Th>
						<Table.Th>Type</Table.Th>
						<Table.Th>Priority</Table.Th>
						<Table.Th>Due</Table.Th>
						<Table.Th>Tags</Table.Th>
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{results.map((result, index) => (
						<Table.Tr key={elementKey(result)}>
							<Table.Td>
								<Checkbox
									aria-label={`Select ${result.name}`}
									checked={selectedKeys.has(
										elementKey(result),
									)}
									onClick={e => {
										shiftKeyRef.current = e.shiftKey;
									}}
									onChange={() => toggleOne(result, index)}
								/>
							</Table.Td>
							<Table.Td>
								<Group gap="xs" wrap="nowrap">
									<Box flex="0 0 auto" display="flex">
										<ElementNodeIcon
											type={result.type}
											size={16}
										/>
									</Box>
									<Anchor
										component={Link}
										to={paths.element(
											result.type,
											result.id,
										)}
										size="sm"
										c="inherit"
										underline="hover">
										{result.name}
									</Anchor>
								</Group>
							</Table.Td>
							<Table.Td>{elementTypeLabel(result.type)}</Table.Td>
							<Table.Td>
								{formatPriorityPercentage(
									result.priority.percentage,
								)}
							</Table.Td>
							<Table.Td>{formatDateTime(result.due)}</Table.Td>
							<Table.Td>
								<Group gap={4} wrap="wrap">
									{result.tags.map(tag => (
										<Badge
											key={tag.name}
											variant="light"
											size="sm">
											{tag.name}
										</Badge>
									))}
								</Group>
							</Table.Td>
						</Table.Tr>
					))}
				</Table.Tbody>
			</Table>
		</Table.ScrollContainer>
	);
}
