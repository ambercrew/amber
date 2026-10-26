import {
	ELEMENT_RENAMED_EVENT,
	ElementRenamedEventDto,
} from "../api/elements/events/elementRenamedEvent";
import { setElementName } from "../stores/elements/elementsReducer";
import useAppDispatch from "./useAppDispatch";
import { useTauriEvent } from "./useTauriEvent";

/** Applies the backend renaming an auto-named element after its content. Mounted app-wide. */
export function useElementRenamedSync() {
	const dispatch = useAppDispatch();

	useTauriEvent<ElementRenamedEventDto>(ELEMENT_RENAMED_EVENT, payload => {
		dispatch(setElementName(payload));
	});
}
