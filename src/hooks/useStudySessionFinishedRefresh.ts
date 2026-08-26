import { useWindowEvent } from "@mantine/hooks";
import { elementExists, getElementById } from "../api/elements/api/elementsApi";
import { setCurrentElement } from "../stores/elements/elementsReducer";
import { loadElementDetailsAction } from "../stores/elementDetails/elementDetailsActions";
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

		void elementExists(params).then(exists => {
			if (!exists) return;
			void getElementById(params).then(element =>
				dispatch(setCurrentElement(element)),
			);
			void dispatch(loadElementDetailsAction(params));
		});
	});
}
