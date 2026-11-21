import {
	CARD_CHANGED_EVENT,
	CardChangedEventDto,
} from "../api/elements/events/cardChangedEvent";
import { reloadEditedCurrentElementAction } from "../stores/elements/elementsActions";
import useAppDispatch from "./useAppDispatch";
import { useTauriEvent } from "./useTauriEvent";

/**
 * Reloads the open card when something other than its view changed it (an approved AI call rewriting it
 * or clearing its leech tag). Mounted app-wide, since hidden aside tabs drop their listeners.
 */
export function useCardChangedRefresh() {
	const dispatch = useAppDispatch();

	useTauriEvent<CardChangedEventDto>(
		CARD_CHANGED_EVENT,
		({ cardId }) =>
			void dispatch(reloadEditedCurrentElementAction([cardId])),
	);
}
