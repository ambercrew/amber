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

// Applies schedule changes made outside the running session (due date, finish, reset) to its queue, or
// a review would overwrite them; newly due elements join, suspended or trashed ones leave.
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
