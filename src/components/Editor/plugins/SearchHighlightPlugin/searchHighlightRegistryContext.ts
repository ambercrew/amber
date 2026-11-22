import { createContext, useContext } from "react";
import { SearchHighlightRegistry } from "./searchHighlightRegistry";

/** One per element viewer, shared by its editors, its find-in-page and the overlay painting the matches. */
export const SearchHighlightRegistryContext =
	createContext<SearchHighlightRegistry | null>(null);

export function useSearchHighlightRegistry(): SearchHighlightRegistry {
	const registry = useContext(SearchHighlightRegistryContext);
	if (!registry)
		throw new Error(
			"useSearchHighlightRegistry must be used inside SearchHighlightRegistryContext",
		);
	return registry;
}
