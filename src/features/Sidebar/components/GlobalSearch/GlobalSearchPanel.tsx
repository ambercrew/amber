import {
	ActionIcon,
	Alert,
	Box,
	CloseButton,
	Group,
	Loader,
	ScrollArea,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
	ArrowsInLineVerticalIcon,
	ArrowsOutLineVerticalIcon,
	MagnifyingGlassIcon,
	TextAaIcon,
} from "@phosphor-icons/react";
import { ReactNode, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
	ContentMatchDto,
	ElementContentMatchesDto,
} from "../../../../api/search/dto/searchContentResponseDto";
import AppTooltip from "../../../../components/AppTooltip/AppTooltip";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { useFocusOnRequest } from "../../../../hooks/useFocusRequest";
import { paths } from "../../../../paths";
import { openSearchAtMatch } from "../../../../stores/search/searchReducer";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";
import {
	flattenSearchResults,
	searchMatchKey,
} from "../../utils/flattenSearchResults";
import PanelHeader from "../PanelHeader";
import GlobalSearchResults from "./GlobalSearchResults";

const QUERY_DEBOUNCE_IN_MILLISECONDS = 200;

/** A count in the text's own color, its noun dimmed like the rest of the line. */
function Count({ count, noun }: { count: number; noun: string }) {
	return (
		<>
			<Text span inherit fw={600} c="var(--mantine-color-text)">
				{count.toLocaleString()}
			</Text>{" "}
			{noun}
			{count === 1 ? "" : "s"}
		</>
	);
}

/** Searches the text of every element, listing each match with its element. */
function GlobalSearchPanel() {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [debouncedQuery] = useDebouncedValue(
		query,
		QUERY_DEBOUNCE_IN_MILLISECONDS,
	);
	const { results, searching, errorMessage } = useGlobalSearch(
		debouncedQuery,
		caseSensitive,
	);
	const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);

	useFocusOnRequest("globalSearch", () => inputRef.current?.select());

	const elements = useMemo(() => results?.elements ?? [], [results]);
	const rows = useMemo(
		() => flattenSearchResults(elements, collapsedIds),
		[elements, collapsedIds],
	);
	const matchCount = elements.reduce(
		(sum, element) => sum + element.matches.length,
		0,
	);
	const allCollapsed =
		elements.length > 0 &&
		elements.every(element => collapsedIds.has(element.elementId.id));

	const toggleElement = (elementId: string) =>
		setCollapsedIds(previous => {
			const next = new Set(previous);
			if (!next.delete(elementId)) next.add(elementId);
			return next;
		});

	const openMatch = (
		element: ElementContentMatchesDto,
		match: ContentMatchDto,
	) => {
		if (!results) return;
		const { elementId } = element;
		setSelectedKey(searchMatchKey(elementId.id, match.index));
		void navigate(paths.element(elementId.type, elementId.id));
		dispatch(
			openSearchAtMatch({
				query: results.query,
				caseSensitive: results.caseSensitive,
				elementId,
				index: match.index,
			}),
		);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		// Results can still answer an earlier query while typing.
		const resultsAreCurrent =
			results?.query === query && results.caseSensitive === caseSensitive;
		if (
			event.key === "Enter" &&
			resultsAreCurrent &&
			elements[0]?.matches[0]
		) {
			event.preventDefault();
			openMatch(elements[0], elements[0].matches[0]);
		} else if (event.key === "Escape" && query) {
			event.preventDefault();
			setQuery("");
		}
	};

	let summary: ReactNode;
	if (!query)
		summary = "Search the text of every learning asset, extract and card.";
	else if (!results) summary = "Searching…";
	else if (matchCount === 0) summary = "No results.";
	else
		summary = (
			<>
				{results.truncated && "First "}
				<Count count={matchCount} noun="result" /> in{" "}
				<Count count={elements.length} noun="element" />
			</>
		);

	return (
		<Stack gap={0} h="100%">
			<Stack gap="xs" px="md" pt="sm" pb="xs">
				<PanelHeader
					title="Search"
					actions={[
						{
							icon: allCollapsed ? (
								<ArrowsOutLineVerticalIcon />
							) : (
								<ArrowsInLineVerticalIcon />
							),
							label: allCollapsed ? "Expand all" : "Collapse all",
							disabled: elements.length === 0,
							onClick: () =>
								setCollapsedIds(
									allCollapsed
										? new Set()
										: new Set(
												elements.map(
													element =>
														element.elementId.id,
												),
											),
								),
						},
					]}
				/>
				<TextInput
					ref={inputRef}
					placeholder="Search in all elements"
					aria-label="Search in all elements"
					value={query}
					onChange={event => setQuery(event.currentTarget.value)}
					onKeyDown={handleKeyDown}
					leftSection={<MagnifyingGlassIcon size={16} />}
					rightSectionWidth={query ? 60 : 32}
					rightSection={
						<Group gap={2} wrap="nowrap">
							{query && (
								<CloseButton
									size="sm"
									aria-label="Clear search"
									onClick={() => {
										setQuery("");
										inputRef.current?.focus();
									}}
								/>
							)}
							<AppTooltip label="Match case">
								<ActionIcon
									size="sm"
									variant={
										caseSensitive ? "filled" : "subtle"
									}
									aria-label="Match case"
									aria-pressed={caseSensitive}
									onClick={() =>
										setCaseSensitive(value => !value)
									}>
									<TextAaIcon size={16} />
								</ActionIcon>
							</AppTooltip>
						</Group>
					}
				/>
				<Stack gap={2}>
					<Group gap="xs" wrap="nowrap" mih={20}>
						<Text size="sm" c="dimmed" flex={1} role="status">
							{summary}
						</Text>
						{searching && <Loader size={14} />}
					</Group>
					{results?.truncated && (
						<Text size="xs" c="dimmed">
							Refine your search to see the rest.
						</Text>
					)}
				</Stack>
				{errorMessage && (
					<Alert color="red" variant="light" p="xs">
						<Text size="xs">{errorMessage}</Text>
					</Alert>
				)}
			</Stack>
			<ScrollArea
				flex={1}
				styles={{ viewport: { overscrollBehavior: "contain" } }}>
				<Box pb="xs">
					<GlobalSearchResults
						rows={rows}
						selectedKey={selectedKey}
						onToggleElement={toggleElement}
						onOpenMatch={openMatch}
					/>
				</Box>
			</ScrollArea>
		</Stack>
	);
}

export default GlobalSearchPanel;
