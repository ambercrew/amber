import { createContext, use } from "react";
import { HighlightCreatedPayload } from "../../../../components/Editor/plugins/HighlightPlugin/highlightCommands";

/** The wiring `SplitStack`/`SplitSlot` need from the core, kept out of the plugin-facing `ReaderCore`. */
export interface SplitStackWiring {
	/** The stack's measured width (rounded), which placeholder heights are estimated from; `0` until measured. */
	contentWidth: number;
	/** Ref for the stack's container, measured for `contentWidth`. */
	containerRef: (node: HTMLElement | null) => void;
	/** Ref for a slot's root element, observed for viewport entry. */
	slotRef: (seq: number) => (element: Element | null) => void;
	/** Ref for a mounted split's content box, measured for its placeholder height. */
	observeSplit: (
		seq: number,
		charCount: number,
	) => (element: HTMLElement | null) => void;
	/** Ref for a mounted split's editable root. */
	contentRootRef: (seq: number) => (element: HTMLElement | null) => void;
	/** Ref for a split's content box, mounted or not. */
	splitBoxRef: (seq: number) => (element: HTMLElement | null) => void;
	/** Called once split `seq`'s editor has mounted with its content, so a navigation waiting on it can land. */
	notifyContentReady: (seq: number) => void;
	/** The view's handler for a highlight created in any split; plugins listen for `HIGHLIGHT_CREATED_COMMAND` directly. */
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
}

export const SplitStackContext = createContext<SplitStackWiring | null>(null);

export function useSplitStackWiring(): SplitStackWiring {
	const wiring = use(SplitStackContext);
	if (!wiring) {
		throw new Error(
			"useSplitStackWiring must be used inside ReaderCoreProvider",
		);
	}
	return wiring;
}
