import { useEffect } from "react";
import { notifications } from "@mantine/notifications";
import {
	SessionSummary,
	summaryDismissed,
} from "../../../stores/study/studyReducer";
import { selectStudySummary } from "../../../stores/study/studySelectors";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { countNoun } from "../../../utils/countNoun";

// Every session with reviews ends with its counts: "Done for today" once the
// queue runs out, "Session ended" when the user ends it first.
export function useStudySessionSummaryToast() {
	const dispatch = useAppDispatch();
	const summary = useAppSelector(selectStudySummary);

	useEffect(() => {
		if (!summary) return;
		notifications.show({ message: describeSummary(summary) });
		dispatch(summaryDismissed());
	}, [summary, dispatch]);
}

export function describeSummary(summary: SessionSummary): string {
	const heading = summary.endedEarly ? "Session ended" : "Done for today";
	const parts = [
		summary.cards > 0 && countNoun(summary.cards, "card"),
		summary.learningAssets > 0 &&
			countNoun(summary.learningAssets, "learning asset"),
		summary.extracts > 0 && countNoun(summary.extracts, "extract"),
	].filter(part => part !== false);
	if (parts.length === 0) return heading;
	return `${heading} — ${parts.join(", ")} in ${formatSessionDuration(summary.durationMs)}`;
}

/** "under a minute", "18 min", "1 h", "1 h 5 min". */
export function formatSessionDuration(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	if (minutes < 1) return "under a minute";
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
