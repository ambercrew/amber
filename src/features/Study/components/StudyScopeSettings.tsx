import { useMemo, useState } from "react";
import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { PencilSimpleIcon, PlusIcon, TargetIcon } from "@phosphor-icons/react";
import { StudyScopeDto } from "../../../api/study/dto/studyScopeDto";
import { SavedSearchResponseDto } from "../../../api/savedSearches/dto/savedSearchResponseDto";
import { ElementFilter } from "../../../api/savedSearches/dto/elementFilter";
import {
	CUSTOM_QUERY_LABEL,
	useCustomQueryLabels,
	useStudyScopeLabel,
} from "../hooks/useStudyScopeLabel";
import {
	isSameQuery,
	useRecentCustomQueries,
} from "../hooks/useRecentCustomQueries";
import ScopeQueryModal from "./ScopeQueryModal";

const EVERYTHING = "everything";
const CUSTOM = "custom";
const SAVED_PREFIX = "saved:";
const RECENT_PREFIX = "recent:";

function toValue(scope: StudyScopeDto | null, isActive: boolean): string {
	if (!scope || !isActive) return EVERYTHING;
	return scope.type === "custom"
		? CUSTOM
		: `${SAVED_PREFIX}${scope.savedSearchId}`;
}

export default function StudyScopeSettings({
	value,
	onChange,
	savedSearches,
	onSavedSearchCreated,
	disabled,
}: {
	value: StudyScopeDto | null;
	onChange: (value: StudyScopeDto | null) => void;
	savedSearches: SavedSearchResponseDto[];
	onSavedSearchCreated: (savedSearch: SavedSearchResponseDto) => void;
	disabled: boolean;
}) {
	const label = useStudyScopeLabel(value, savedSearches);
	const customFilters = value?.type === "custom" ? value.filters : null;
	const { recents } = useRecentCustomQueries();
	// The selected query already shows above, so it isn't repeated here.
	const otherRecents = useMemo(
		() =>
			recents.filter(
				query => !customFilters || !isSameQuery(query, customFilters),
			),
		[recents, customFilters],
	);
	const recentLabels = useCustomQueryLabels(otherRecents);
	const [queryModal, setQueryModal] = useState({
		opened: false,
		// Bumped on every open so the modal remounts with fresh state.
		key: 0,
		initialFilters: [] as ElementFilter[],
	});

	function openQueryModal(initialFilters: ElementFilter[]) {
		setQueryModal(current => ({
			opened: true,
			key: current.key + 1,
			initialFilters,
		}));
	}

	function handleSelect(selected: string | null) {
		if (!selected || selected === EVERYTHING) onChange(null);
		else if (selected.startsWith(RECENT_PREFIX)) {
			const index = Number(selected.slice(RECENT_PREFIX.length));
			onChange({ type: "custom", filters: otherRecents[index] });
		} else if (selected.startsWith(SAVED_PREFIX)) {
			onChange({
				type: "savedSearch",
				savedSearchId: selected.slice(SAVED_PREFIX.length),
			});
		}
	}

	const data = [
		{
			group: "Scope",
			items: [
				{ value: EVERYTHING, label: "Everything" },
				...(customFilters
					? [{ value: CUSTOM, label: label ?? CUSTOM_QUERY_LABEL }]
					: []),
			],
		},
		...(otherRecents.length > 0
			? [
					{
						group: "Recent queries",
						items: recentLabels.map((recentLabel, index) => ({
							value: `${RECENT_PREFIX}${index}`,
							label: recentLabel,
						})),
					},
				]
			: []),
		...(savedSearches.length > 0
			? [
					{
						group: "Saved searches",
						items: savedSearches.map(search => ({
							value: `${SAVED_PREFIX}${search.id}`,
							label: search.name,
						})),
					},
				]
			: []),
	];

	return (
		<Stack gap={4}>
			<Text size="sm" fw={500}>
				Study scope
			</Text>
			<Text size="xs" c="dimmed">
				{disabled
					? "Can't be changed while a study session is running."
					: "Only study due elements matching a saved search or query."}
			</Text>
			<Group gap="xs" wrap="nowrap" align="flex-start">
				<Select
					aria-label="Study scope"
					data={data}
					value={toValue(value, label !== null)}
					onChange={handleSelect}
					allowDeselect={false}
					withAlignedLabels
					searchable
					disabled={disabled}
					leftSection={<TargetIcon size={16} />}
					style={{ flex: 1 }}
				/>
				<Button
					variant="default"
					disabled={disabled}
					leftSection={
						customFilters ? (
							<PencilSimpleIcon size={14} />
						) : (
							<PlusIcon size={14} />
						)
					}
					onClick={() => openQueryModal(customFilters ?? [])}>
					{customFilters ? "Edit query" : "New query…"}
				</Button>
			</Group>
			<ScopeQueryModal
				key={queryModal.key}
				opened={queryModal.opened}
				initialFilters={queryModal.initialFilters}
				onClose={() =>
					setQueryModal(current => ({ ...current, opened: false }))
				}
				onUseCustom={filters => onChange({ type: "custom", filters })}
				onCreated={savedSearch => {
					onSavedSearchCreated(savedSearch);
					onChange({
						type: "savedSearch",
						savedSearchId: savedSearch.id,
					});
				}}
			/>
		</Stack>
	);
}
