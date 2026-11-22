/** Location state of opening an element at one spot, like a search match or an origin link: a lookup, not reading. */
export interface SpotNavigationState {
	openedAtSpot?: boolean;
	/** Id of the element whose highlight to scroll to, e.g. a card opening its source. */
	revealHighlightOf?: string;
}

export function spotNavigationState(
	revealHighlightOf?: string,
): SpotNavigationState {
	return { openedAtSpot: true, revealHighlightOf };
}

export function readSpotNavigationState(state: unknown): SpotNavigationState {
	return typeof state === "object" && state !== null
		? (state as SpotNavigationState)
		: {};
}
