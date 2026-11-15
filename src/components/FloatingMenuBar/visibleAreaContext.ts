import { createContext, use } from "react";

/**
 * An invisible element covering the part of the main content area that isn't
 * behind the header or footer right now. Floating menus stay inside it.
 */
export const VisibleAreaContext = createContext<HTMLElement | null>(null);

/** The visible part of the main content area, or null outside the app shell. */
export function useVisibleAreaElement() {
	return use(VisibleAreaContext);
}
