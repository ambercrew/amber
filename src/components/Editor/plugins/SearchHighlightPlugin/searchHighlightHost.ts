export const SEARCH_HIGHLIGHT_HOST_ATTRIBUTE = "data-search-highlight-host";

/** Spread on a scroll container so its matches are painted inside it, scrolling with the text. */
export const searchHighlightHostProps = {
	[SEARCH_HIGHLIGHT_HOST_ATTRIBUTE]: true,
} as const;
