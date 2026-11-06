import {
	Checkbox,
	Group,
	Table,
	TableThProps,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { ReactNode, useRef } from "react";
import {
	CaretDownIcon,
	CaretUpDownIcon,
	CaretUpIcon,
} from "@phosphor-icons/react";
import { SearchElementResultDto } from "../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../types/elements/elementId";
import { elementKey } from "../../utils/elementKey";
import { nextSearchSort } from "../../utils/searchSort";
import {
	SearchSortColumn,
	SearchSortDto,
} from "../../api/search/dto/searchSortDto";
import SearchResultRows from "./SearchResultRows";

// Fixed widths: with automatic ones, columns would shift as rows mount during scrolling.
// Name takes what's left; the others fit their header and a full date on one line.
const SORTABLE_COLUMNS: [SearchSortColumn, string, number?][] = [
	["name", "Name"],
	["type", "Type", 120],
	["priority", "Priority", 100],
	["due", "Due", 190],
];
const TAGS_COLUMN_WIDTH = 140;
const CHECKBOX_COLUMN_WIDTH = 40;
const TABLE_MIN_WIDTH = 720;

interface SortableThProps extends TableThProps {
	column: SearchSortColumn;
	sort: SearchSortDto;
	onSortChange: (sort: SearchSortDto) => void;
	children: ReactNode;
}

function SortableTh({
	column,
	sort,
	onSortChange,
	children,
	...props
}: SortableThProps) {
	const sorted = sort.column === column;
	const Icon = !sorted
		? CaretUpDownIcon
		: sort.direction === "asc"
			? CaretUpIcon
			: CaretDownIcon;

	return (
		<Table.Th
			{...props}
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
	/** Adds a checkbox column; read-only without it. */
	selection?: {
		selectedIds: ElementId[];
		onSelectionChange: (ids: ElementId[]) => void;
	};
}

const NO_SELECTION: ElementId[] = [];

export default function SearchResultsTable({
	results,
	sort,
	onSortChange,
	selection,
}: SearchResultsTableProps) {
	const selectedIds = selection?.selectedIds ?? NO_SELECTION;
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
			selection?.onSelectionChange([]);
		} else {
			selection?.onSelectionChange(
				results.map(r => ({ type: r.type, id: r.id })),
			);
		}
	}

	function toggleOne(
		result: SearchElementResultDto,
		index: number,
		shiftKey: boolean,
	) {
		const key = elementKey(result);
		const isSelected = selectedKeys.has(key);

		if (shiftKey && lastClickedIndexRef.current !== null) {
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
			selection?.onSelectionChange([...merged.values()]);
		} else if (isSelected) {
			selection?.onSelectionChange(
				selectedIds.filter(id => elementKey(id) !== key),
			);
		} else {
			selection?.onSelectionChange([
				...selectedIds,
				{ type: result.type, id: result.id },
			]);
		}

		lastClickedIndexRef.current = index;
	}

	return (
		<Table.ScrollContainer minWidth={TABLE_MIN_WIDTH} type="native">
			<Table
				striped
				highlightOnHover
				verticalSpacing="xs"
				layout="fixed"
				aria-rowcount={results.length + 1}>
				<Table.Thead>
					<Table.Tr>
						{selection && (
							<Table.Th w={CHECKBOX_COLUMN_WIDTH}>
								<Checkbox
									aria-label="Select all results"
									checked={allSelected}
									indeterminate={someSelected && !allSelected}
									onChange={toggleAll}
								/>
							</Table.Th>
						)}
						{SORTABLE_COLUMNS.map(([column, label, width]) => (
							<SortableTh
								key={column}
								column={column}
								sort={sort}
								onSortChange={onSortChange}
								w={width}>
								{label}
							</SortableTh>
						))}
						<Table.Th w={TAGS_COLUMN_WIDTH}>Tags</Table.Th>
					</Table.Tr>
				</Table.Thead>
				<SearchResultRows
					results={results}
					selectedKeys={selectedKeys}
					selectable={!!selection}
					onToggle={toggleOne}
				/>
			</Table>
		</Table.ScrollContainer>
	);
}
