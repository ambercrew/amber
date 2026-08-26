import { createContext, use } from "react";

/**
 * Shares the app's scroll container. The main content area scrolls itself
 * rather than the window, so anything that needs to scroll the page, observe
 * its scrolling or measure its viewport has to target this element.
 */
export const MainScrollContext = createContext<HTMLElement | null>(null);

/** The scroll container of the main content area, or null before it mounts. */
export function useMainScrollElement() {
	return use(MainScrollContext);
}
