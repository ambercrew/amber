import { createContext, use } from "react";

/**
 * Lets a page with its own internal scroll container (e.g. the PDF viewer)
 * drive the app header/footer's pinned state, since scrolling such a page
 * never touches the main scroll area App's own headroom observes. Pass
 * `null` on unmount to hand control back to the main scroll area.
 */
export const HeadroomOverrideContext = createContext<
	((pinned: boolean | null) => void) | null
>(null);

export function useSetHeadroomOverride() {
	return use(HeadroomOverrideContext);
}
