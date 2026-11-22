import { createContext, use } from "react";

/** The app shell's DOM elements that views scroll, observe or position against; null before they mount. */
export interface AppLayout {
	/** The main content scrolls itself, not the window, so anything that scrolls or measures the page targets this. */
	mainScrollElement: HTMLElement | null;
	/** Covers the part of the main content not behind the header or footer; floating menus stay inside it. */
	visibleAreaElement: HTMLElement | null;
}

export const AppLayoutContext = createContext<AppLayout>({
	mainScrollElement: null,
	visibleAreaElement: null,
});

/** The scroll container of the main content area, or null before it mounts. */
export function useMainScrollElement() {
	return use(AppLayoutContext).mainScrollElement;
}

/** The visible part of the main content area, or null outside the app shell. */
export function useVisibleAreaElement() {
	return use(AppLayoutContext).visibleAreaElement;
}
