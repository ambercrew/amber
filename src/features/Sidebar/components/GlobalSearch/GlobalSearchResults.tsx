import { Group, Mark, NavLink, Text } from "@mantine/core";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useState } from "react";
import {
	ContentMatchDto,
	ElementContentMatchesDto,
} from "../../../../api/search/dto/searchContentResponseDto";
import CountBadge from "../../../../components/CountBadge/CountBadge";
import ElementNodeIcon from "../../../../components/ElementNodeIcon/ElementNodeIcon";
import AppTooltip from "../../../../components/AppTooltip/AppTooltip";
import { useVirtualListScroll } from "../../../../hooks/useVirtualListScroll";
import { SearchResultRow } from "../../utils/flattenSearchResults";

const ICON_SIZE = 16;
const CARET_SIZE = 12;
// Rows are one line each, so fixed heights spare measuring and keep the scrollbar from shifting.
const ELEMENT_ROW_HEIGHT = 30;
const MATCH_ROW_HEIGHT = 26;
const OVERSCAN_ROWS = 10;
/** Lines a match up under its element's name, past the caret and icon. */
const MATCH_INDENT = 46;

interface GlobalSearchResultsProps {
	rows: SearchResultRow[];
	selectedKey: string | null;
	onToggleElement: (elementId: string) => void;
	onOpenMatch: (
		element: ElementContentMatchesDto,
		match: ContentMatchDto,
	) => void;
}

interface SearchResultRowContentProps {
	row: SearchResultRow;
	selected: boolean;
	onToggleElement: GlobalSearchResultsProps["onToggleElement"];
	onOpenMatch: GlobalSearchResultsProps["onOpenMatch"];
}

function SearchResultRowView({
	row,
	selected,
	onToggleElement,
	onOpenMatch,
}: SearchResultRowContentProps) {
	return row.kind === "element" ? (
		<NavLink
			h="100%"
			py={0}
			label={
				<AppTooltip label={row.element.name} multiline maw={320}>
					<Text size="sm" fw={500} truncate="end">
						{row.element.name}
					</Text>
				</AppTooltip>
			}
			aria-expanded={!row.collapsed}
			leftSection={
				<Group gap={4} wrap="nowrap">
					{row.collapsed ? (
						<CaretRightIcon size={CARET_SIZE} />
					) : (
						<CaretDownIcon size={CARET_SIZE} />
					)}
					<ElementNodeIcon
						type={row.element.elementId.type}
						size={ICON_SIZE}
					/>
				</Group>
			}
			rightSection={<CountBadge count={row.element.matches.length} />}
			onClick={() => onToggleElement(row.element.elementId.id)}
		/>
	) : (
		<NavLink
			h="100%"
			py={0}
			pl={MATCH_INDENT}
			active={selected}
			label={
				<AppTooltip
					label={`${row.match.before}${row.match.text}${row.match.after}`}
					multiline
					maw={320}>
					<Text size="sm" truncate="end">
						{row.match.before}
						<Mark>{row.match.text}</Mark>
						{row.match.after}
					</Text>
				</AppTooltip>
			}
			onClick={() => onOpenMatch(row.element, row.match)}
		/>
	);
}

/** Memoized, so scrolling renders only the rows it mounts, not every row already shown. */
const SearchResultRowContent = memo(SearchResultRowView);

/** Mounts only the rows near the panel's scroll position. */
function GlobalSearchResults({
	rows,
	selectedKey,
	onToggleElement,
	onOpenMatch,
}: GlobalSearchResultsProps) {
	// The virtualizer changes in place, so the compiler would keep showing its first rows.
	"use no memo";

	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const { viewport, scrollMargin } = useVirtualListScroll(root);
	const getItemKey = useCallback((index: number) => rows[index].key, [rows]);
	const estimateSize = useCallback(
		(index: number) =>
			rows[index].kind === "element"
				? ELEMENT_ROW_HEIGHT
				: MATCH_ROW_HEIGHT,
		[rows],
	);
	// eslint-disable-next-line react-hooks/incompatible-library -- skipped by the directive above
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => viewport,
		estimateSize,
		overscan: OVERSCAN_ROWS,
		scrollMargin,
		getItemKey,
	});

	return (
		<div
			ref={setRoot}
			style={{
				height: virtualizer.getTotalSize(),
				position: "relative",
			}}>
			{virtualizer.getVirtualItems().map(item => {
				const row = rows[item.index];
				return (
					<div
						key={item.key}
						data-index={item.index}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							height: item.size,
							transform: `translateY(${item.start - scrollMargin}px)`,
						}}>
						<SearchResultRowContent
							row={row}
							selected={row.key === selectedKey}
							onToggleElement={onToggleElement}
							onOpenMatch={onOpenMatch}
						/>
					</div>
				);
			})}
		</div>
	);
}

export default GlobalSearchResults;
