import { ELEMENT_DUE_CHANGED_EVENT } from "../api/study/events/elementDueChangedEvent";
import { loadElementDetailsAction } from "../stores/elementDetails/elementDetailsActions";
import { selectCurrentElement } from "../stores/elements/elementsSelectors";
import useAppDispatch from "./useAppDispatch";
import useAppSelector from "./useAppSelector";
import { useTauriEvent } from "./useTauriEvent";

/**
 * Reloads the open element's details when its schedule changes elsewhere (e.g. an approved AI
 * call finishing it). Mounted app-wide, since hidden aside tabs drop their listeners.
 */
export function useElementDueChangedRefresh() {
	const dispatch = useAppDispatch();
	const elementId = useAppSelector(selectCurrentElement)?.data.meta.elementId;

	useTauriEvent(ELEMENT_DUE_CHANGED_EVENT, () => {
		if (!elementId) return;
		void dispatch(loadElementDetailsAction(elementId));
	});
}
