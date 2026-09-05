import { useWindowEvent } from "@mantine/hooks";
import { loadCurrentElementAction } from "../stores/elements/elementsActions";
import { STUDY_SESSION_FINISHED } from "../types/events/studySessionFinishedEvent";
import useAppDispatch from "./useAppDispatch";
import { useElementParams } from "./useElementParams";

/**
 * Reloads the currently open element once a study session finishes, so the
 * Aside panel's "Due" field reflects the scheduling change from the last
 * review instead of staying stale until the user navigates away or refreshes.
 */
export function useStudySessionFinishedRefresh() {
	const params = useElementParams();
	const dispatch = useAppDispatch();

	useWindowEvent(STUDY_SESSION_FINISHED, () => {
		if (!params) return;
		void dispatch(loadCurrentElementAction(params));
	});
}
