import { ElementId } from "../../types/elements/elementId";

/** What one import created, for the caller to open, or why it stopped. */
export type ImportResult<E> =
	{ ok: true; created: ElementId | null } | { ok: false; error: E };
