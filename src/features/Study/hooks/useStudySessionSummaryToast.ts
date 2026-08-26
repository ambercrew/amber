import { useEffect } from "react";
import { notifications } from "@mantine/notifications";
import { summaryDismissed } from "../../../stores/study/studyReducer";
import { selectStudySummary } from "../../../stores/study/studySelectors";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";

// The session never ends silently: reaching the end of the queue always
// surfaces a "Done for today" toast built from the session counters.
export function useStudySessionSummaryToast() {
	const dispatch = useAppDispatch();
	const summary = useAppSelector(selectStudySummary);

	useEffect(() => {
		if (!summary) return;
		notifications.show({
			message: `Done for today — ${summary.cards} cards, ${summary.learningAssets} learningAssets, ${summary.extracts} extracts`,
		});
		dispatch(summaryDismissed());
	}, [summary, dispatch]);
}
