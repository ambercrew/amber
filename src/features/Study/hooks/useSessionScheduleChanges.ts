import { useNavigate } from "react-router";
import { ELEMENT_DUE_CHANGED_EVENT } from "../../../api/study/events/elementDueChangedEvent";
import {
	ELEMENTS_SUSPENDED_EVENT,
	ElementsSuspendedEventDto,
} from "../../../api/study/events/elementsSuspendedEvent";
import {
	ELEMENTS_TRASHED_EVENT,
	ElementsTrashedEventDto,
} from "../../../api/trash/events/elementsTrashedEvent";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { useTauriEvent } from "../../../hooks/useTauriEvent";
import { selectStudyStatus } from "../../../stores/study/studySelectors";
import {
	addNewlyDueElementsAction,
	applyScheduleChangeAction,
	dropSuspendedElementsAction,
} from "../../../stores/study/studyActions";

// A running session owns its queue on the frontend, so it has to hear about
// schedule changes made outside it (the aside's due date, finishing an
// element, resetting its repetitions) — otherwise the session stays on an
// element that is no longer due and the next review overwrites the new
// schedule. Elements that become due meanwhile join the queue, and suspended
// ones leave it, as do trashed ones.
export function useSessionScheduleChanges() {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const studying = useAppSelector(selectStudyStatus) === "studying";

	useTauriEvent(ELEMENT_DUE_CHANGED_EVENT, () => {
		void dispatch(applyScheduleChangeAction(navigate));
		void dispatch(addNewlyDueElementsAction());
	});

	useTauriEvent<ElementsSuspendedEventDto>(
		ELEMENTS_SUSPENDED_EVENT,
		({ elementIds }) => {
			void dispatch(dropSuspendedElementsAction(elementIds, navigate));
		},
	);

	// Outside a session the sidebar preview refreshes itself, in `useDueElementsPreview`.
	useTauriEvent<ElementsTrashedEventDto>(
		ELEMENTS_TRASHED_EVENT,
		({ elementIds }) => {
			if (studying)
				void dispatch(
					dropSuspendedElementsAction(elementIds, navigate),
				);
		},
	);
}
