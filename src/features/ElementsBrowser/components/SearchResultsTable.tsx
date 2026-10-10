import {
	Anchor,
	Badge,
	Box,
	Checkbox,
	Group,
	Table,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { ReactNode, useRef } from "react";
import {
	CaretDownIcon,
	CaretUpDownIcon,
	CaretUpIcon,
} from "@phosphor-icons/react";
import { Link } from "react-router";
import { SearchElementResultDto } from "../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../types/elements/elementId";
import { paths } from "../../../paths";
import { formatPriorityPercentile } from "../../../utils/formatPriorityPercentile";
import ElementNodeIcon from "../../../components/ElementNodeIcon/ElementNodeIcon";
import { elementTypeOptions } from "../utils/elementTypeOptions";
import { elementKey } from "../../../utils/elementKey";
import { nextSearchSort } from "../utils/searchSort";
import {
	SearchSortColumn,
	SearchSortDto,
} from "../../../api/search/dto/searchSortDto";

function elementTypeLabel(type: SearchElementResultDto["type"]): string {
	return (
		elementTypeOptions.find(option => option.value === type)?.label ?? type
	);
}

function formatDateTime(value: string | null): string {
	return value ? new Date(value).toLocaleString() : "—";
}

const SORTABLE_COLUMNS: [SearchSortColumn, string][] = [
	["name", "Name"],
	["type", "Type"],
	["priority", "Priority"],
	["due", "Due"],
];

interface SortableThProps {
	column: SearchSortColumn;
	sort: SearchSortDto;
	onSortChange: (sort: SearchSortDto) => void;
	children: ReactNode;
}

function SortableTh({ column, sort, onSortChange, children }: SortableThProps) {
	const sorted = sort.column === column;
	const Icon = !sorted
		? CaretUpDownIcon
		: sort.direction === "asc"
			? CaretUpIcon
			: CaretDownIcon;

	return (
		<Table.Th
			aria-sort={
				sorted
					? sort.direction === "asc"
						? "ascending"
						: "descending"
					: undefined
			}>
			<UnstyledButton
				fw={700}
				fz="sm"
				onClick={() => onSortChange(nextSearchSort(sort, column))}>
				<Group gap={4} wrap="nowrap">
					{children}
					<Icon
						size={14}
						opacity={sorted ? 1 : 0.4}
						aria-hidden="true"
					/>
				</Group>
			</UnstyledButton>
		</Table.Th>
	);
}

interface SearchResultsTableProps {
	/** Already sorted by `sort`, which the backend applies. */
	results: SearchElementResultDto[];
	sort: SearchSortDto;
	onSortChange: (sort: SearchSortDto) => void;
	selectedIds: ElementId[];
	onSelectionChange: (ids: ElementId[]) => void;
}

export default function SearchResultsTable({
	results,
	sort,
	onSortChange,
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
						{SORTABLE_COLUMNS.map(([column, label]) => (
							<SortableTh
								key={column}
								column={column}
								sort={sort}
								onSortChange={onSortChange}>
								{label}
							</SortableTh>
						))}
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
								{formatPriorityPercentile(
									result.priority.percentile,
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
