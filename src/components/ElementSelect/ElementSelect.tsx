import { ReactNode, useEffect, useRef, useState } from "react";
import {
	CloseButton,
	Combobox,
	ComboboxProps,
	Group,
	InputBase,
	Text,
	useCombobox,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { searchElements } from "../../api/search/api/searchApi";
import { SearchElementResultDto } from "../../api/search/dto/searchElementResultDto";
import { ElementFilter } from "../../api/savedSearches/dto/elementFilter";
import { ElementId } from "../../types/elements/elementId";
import { ElementNodeType } from "../../types/elements/elementNodeType";
import ElementNodeIcon from "../ElementNodeIcon/ElementNodeIcon";
import useApi from "../../hooks/useApi";
import useElementName from "../../hooks/useElementName";
import { elementKey } from "../../utils/elementKey";

const DEFAULT_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 200;

export interface ElementSelectProps {
	value: ElementId | null;
	onChange: (value: ElementId | null) => void;
	/** Restricts the selectable elements to these types. */
	types?: ElementNodeType[];
	/** Maximum number of options fetched per search, highest priority first. */
	limit?: number;
	label?: ReactNode;
	placeholder?: string;
	clearable?: boolean;
	disabled?: boolean;
	/** Focuses the input on mount (also inside a Mantine focus trap), which opens the dropdown. */
	autoFocus?: boolean;
	comboboxProps?: ComboboxProps;
}

interface SearchResult {
	requestKey: string;
	/** `null` when the search failed. */
	options: SearchElementResultDto[] | null;
}

function buildFilters(
	search: string,
	types: ElementNodeType[] | undefined,
): ElementFilter[] {
	const filters: ElementFilter[] = [];
	if (search) {
		filters.push({
			id: crypto.randomUUID(),
			field: "name",
			operator: "contains",
			value: search,
		});
	}
	if (types) {
		filters.push({
			id: crypto.randomUUID(),
			field: "elementType",
			operator: "isAnyOf",
			types,
		});
	}
	return filters;
}

/** Searchable element picker that only fetches the top matches for the typed query. */
export default function ElementSelect({
	value,
	onChange,
	types,
	limit = DEFAULT_LIMIT,
	label,
	placeholder = "Search elements",
	clearable,
	disabled,
	autoFocus,
	comboboxProps,
}: ElementSelectProps) {
	const combobox = useCombobox({
		onDropdownClose: () => {
			combobox.resetSelectedOption();
			setSearch(null);
		},
	});
	// `null` while not typing, so the input shows the selected element's name.
	const [search, setSearch] = useState<string | null>(null);
	const [debouncedSearch] = useDebouncedValue(
		search?.trim() ?? "",
		SEARCH_DEBOUNCE_MS,
	);
	// Tagged with its request key so stale or overlapping searches can't leak into the UI.
	const [result, setResult] = useState<SearchResult | null>(null);
	const { callApi, errorMessage } = useApi();
	const selected = useElementName(value);
	const latestRequestKey = useRef<string | null>(null);
	const typesKey = types?.join(",");
	const opened = combobox.dropdownOpened;
	const requestKey = JSON.stringify([debouncedSearch, typesKey, limit]);
	const options = result?.options ?? [];
	const isSearching = opened && result?.requestKey !== requestKey;

	useEffect(() => {
		if (!opened) return;
		latestRequestKey.current = requestKey;
		void callApi(() =>
			searchElements({
				filters: buildFilters(debouncedSearch, types),
				limit,
			}),
		).then(results => {
			if (requestKey === latestRequestKey.current) {
				setResult({ requestKey, options: results ?? null });
			}
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [opened, requestKey, callApi]);

	function handleOptionSubmit(key: string) {
		const option = options.find(o => elementKey(o) === key);
		if (option) {
			onChange({ type: option.type, id: option.id });
		}
		combobox.closeDropdown();
	}

	const rightSection =
		clearable && value && !disabled ? (
			<CloseButton
				size="sm"
				aria-label="Clear element"
				onMouseDown={event => event.preventDefault()}
				onClick={() => onChange(null)}
			/>
		) : (
			<Combobox.Chevron />
		);

	return (
		<Combobox
			store={combobox}
			onOptionSubmit={handleOptionSubmit}
			{...comboboxProps}>
			<Combobox.Target>
				<InputBase
					label={label}
					placeholder={placeholder}
					disabled={disabled}
					autoFocus={autoFocus}
					data-autofocus={autoFocus ? true : undefined}
					error={search === null ? selected.errorMessage : undefined}
					value={search ?? selected.name ?? ""}
					leftSection={
						value && search === null ? (
							<ElementNodeIcon type={value.type} size={16} />
						) : undefined
					}
					rightSection={rightSection}
					rightSectionPointerEvents={
						clearable && value ? "all" : "none"
					}
					onChange={event => {
						setSearch(event.currentTarget.value);
						combobox.openDropdown();
						combobox.updateSelectedOptionIndex();
					}}
					onClick={() => combobox.openDropdown()}
					onFocus={() => combobox.openDropdown()}
					onBlur={() => combobox.closeDropdown()}
				/>
			</Combobox.Target>
			<Combobox.Dropdown>
				<Combobox.Options mah={280} style={{ overflowY: "auto" }}>
					{options.length > 0 ? (
						options.map(option => (
							<Combobox.Option
								key={elementKey(option)}
								value={elementKey(option)}
								active={
									value?.id === option.id &&
									value.type === option.type
								}>
								<Group gap="xs" wrap="nowrap">
									<ElementNodeIcon
										type={option.type}
										size={16}
									/>
									<Text size="sm" truncate>
										{option.name}
									</Text>
								</Group>
							</Combobox.Option>
						))
					) : (
						<Combobox.Empty>
							{isSearching
								? "Searching…"
								: result && !result.options
									? errorMessage
									: "No elements found"}
						</Combobox.Empty>
					)}
				</Combobox.Options>
			</Combobox.Dropdown>
		</Combobox>
	);
}
