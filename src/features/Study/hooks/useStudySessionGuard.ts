import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router";
import { stopStudySessionAction } from "../../../stores/study/studyActions";
import { selectStudyStatus } from "../../../stores/study/studySelectors";
import { StudySessionLocationState } from "../../../types/study/studySessionLocationState";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";

// Any route change that isn't the session engine's own navigation (e.g. the
// sidebar, back/forward, or the command palette) ends the active session.
// Keyed on location.key (not status) so a session-start's own navigation,
// which briefly lands after the "studying" status is already committed,
// isn't mistaken for a manual navigation away.
export function useStudySessionGuard() {
	const dispatch = useAppDispatch();
	const location = useLocation();
	const status = useAppSelector(selectStudyStatus);
	const statusRef = useRef(status);
	useLayoutEffect(() => {
		statusRef.current = status;
	});

	useEffect(() => {
		if (statusRef.current !== "studying") return;
		const state = location.state as StudySessionLocationState | null;
		if (!state?.studySessionNav) dispatch(stopStudySessionAction());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.key, dispatch]);
}
