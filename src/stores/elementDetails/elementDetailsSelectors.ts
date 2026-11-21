import { RootState } from "../store";
import { selectCurrentElement } from "../elements/elementsSelectors";

export const selectElementDetailsIsLoading = (state: RootState) =>
	state.elementDetails.isLoading;

/**
 * The loaded details only when they're the current element's, so callers see `null`, not the
 * previous element's, while another's are loading.
 */
export function selectCurrentElementDetails(state: RootState) {
	const currentElement = selectCurrentElement(state);
	const elementId = currentElement?.data.meta.elementId;
	const { elementId: loadedFor, details } = state.elementDetails;
	if (!elementId || !details || !loadedFor) return null;
	if (loadedFor.type !== elementId.type || loadedFor.id !== elementId.id)
		return null;
	return details;
}
