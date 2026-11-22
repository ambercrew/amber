import { useWindowEvent } from "@mantine/hooks";
import { loadCurrentElementAction } from "../stores/elements/elementsActions";
import { STUDY_SESSION_FINISHED } from "../types/events/studySessionFinishedEvent";
import useAppDispatch from "./useAppDispatch";
import { useElementParams } from "./useElementParams";

/**
 * Reloads the open element once a study session finishes, so the Aside's "Due" field
 * shows the last review's schedule.
 */
export function useStudySessionFinishedRefresh() {
	const params = useElementParams();
	const dispatch = useAppDispatch();

	useWindowEvent(STUDY_SESSION_FINISHED, () => {
		if (!params) return;
		void dispatch(loadCurrentElementAction(params));
	});
}
