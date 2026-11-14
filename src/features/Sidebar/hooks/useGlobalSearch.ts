import { useEffect, useState } from "react";
import { searchContent } from "../../../api/search/api/searchApi";
import { SearchContentResponseDto } from "../../../api/search/dto/searchContentResponseDto";
import useApi from "../../../hooks/useApi";

export interface GlobalSearchResults extends SearchContentResponseDto {
	/** The search these results answer, which may lag the one being typed. */
	query: string;
	caseSensitive: boolean;
}

/**
 * Searches every element's content for `query`, only when the query or its case setting changes.
 * Earlier results stay until newer ones arrive, so the list doesn't flash while typing.
 */
export function useGlobalSearch(query: string, caseSensitive: boolean) {
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	const [results, setResults] = useState<GlobalSearchResults | null>(null);
	// Only the latest request reports results, an error or the end of searching.
	const [searching, setSearching] = useState(false);

	useEffect(() => {
		if (!query) return;
		let stale = false;
		void callApi(async () => {
			setSearching(true);
			clearErrorMessage();
			try {
				const response = await searchContent({ query, caseSensitive });
				// A superseded search returns null; the newer one reports instead.
				if (!stale && response)
					setResults({ ...response, query, caseSensitive });
			} catch (error) {
				if (!stale) throw error;
			} finally {
				if (!stale) setSearching(false);
			}
		});
		return () => {
			stale = true;
		};
	}, [callApi, clearErrorMessage, query, caseSensitive]);

	return {
		results: query ? results : null,
		searching: query !== "" && searching,
		errorMessage: query ? errorMessage : null,
	};
}
