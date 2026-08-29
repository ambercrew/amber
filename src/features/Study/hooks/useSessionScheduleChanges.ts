import { useNavigate } from "react-router";
import { ELEMENT_DUE_CHANGED_EVENT } from "../../../api/study/events/elementDueChangedEvent";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { useTauriEvent } from "../../../hooks/useTauriEvent";
import { applyScheduleChangeAction } from "../../../stores/study/studyActions";

// A running session owns its queue on the frontend, so it has to hear about
// schedule changes made outside it (the aside's due date, finishing an
// element, resetting its repetitions) — otherwise the session stays on an
// element that is no longer due and the next review overwrites the new
// schedule.
export function useSessionScheduleChanges() {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();

	useTauriEvent(ELEMENT_DUE_CHANGED_EVENT, () => {
		void dispatch(applyScheduleChangeAction(navigate));
	});
}
