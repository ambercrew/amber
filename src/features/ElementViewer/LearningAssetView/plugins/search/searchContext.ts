import { createContext, use } from "react";
import type { MatchTarget } from "./useLearningAssetSearch";

interface SearchContextValue {
	query: string;
	caseSensitive: boolean;
	/** The split and local index of the current match, or `null` when there is none. */
	currentTarget: MatchTarget | null;
	/** Reports a mounted split's own, authoritative match count. */
	onSplitMatches: (splitId: string, count: number) => void;
}

export const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearchContext(): SearchContextValue {
	const value = use(SearchContext);
	if (!value)
		throw new Error("useSearchContext must be used inside SearchProvider");
	return value;
}
