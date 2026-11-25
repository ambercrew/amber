import { OptionsFilter, TagsInput, TagsInputProps } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import { useRef, useState } from "react";
import { searchTags } from "../../api/elements/api/elementsApi";
import useApi from "../../hooks/useApi";
import { matchExistingTags } from "./tagSuggestions";

const SUGGESTION_LIMIT = 50;

/** Keeps the backend's ranking, dropping options a newer search, still loading, rules out. */
const keepBackendOrder: OptionsFilter = ({ options, search }) => {
	const query = search.trim().toLowerCase();
	return options.filter(
		option =>
			"group" in option || option.label.toLowerCase().includes(query),
	);
};

export type TagInputProps = Omit<
	TagsInputProps,
	"data" | "filter" | "limit" | "searchValue" | "onSearchChange"
>;

/** A tags input suggesting the tags already in use, while still taking new ones. */
export default function TagInput({
	value,
	defaultValue,
	onChange,
	onFocus,
	error,
	...props
}: TagInputProps) {
	const { callApi, errorMessage } = useApi();
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [search, setSearch] = useState("");
	// Ignores a slower, older search answering after a newer one.
	const latestSearch = useRef(0);
	const [tags, setTags] = useUncontrolled({
		value,
		defaultValue,
		finalValue: [],
		onChange,
	});

	function loadSuggestions(query: string) {
		const request = ++latestSearch.current;
		void callApi(async () => {
			// Picked tags are left out of the dropdown, so ask for enough to still fill it.
			const found = await searchTags(
				query,
				SUGGESTION_LIMIT + tags.length,
			);
			if (request === latestSearch.current) setSuggestions(found);
		});
	}

	return (
		<TagsInput
			{...props}
			data={suggestions}
			filter={keepBackendOrder}
			limit={SUGGESTION_LIMIT}
			value={tags}
			// A new tag differing from an existing one only by case becomes that one.
			onChange={next =>
				setTags(matchExistingTags(next, tags, suggestions))
			}
			searchValue={search}
			onSearchChange={query => {
				setSearch(query);
				loadSuggestions(query);
			}}
			onFocus={event => {
				onFocus?.(event);
				loadSuggestions(search);
			}}
			error={error ?? errorMessage}
		/>
	);
}
