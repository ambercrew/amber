import { NavigateFunction } from "react-router";
import {
	registerCardReview,
	getDueElements,
	finishLearningAsset,
	nextLearningAsset,
} from "../../api/study/api/studyApi";
import { paths } from "../../paths";
import { CardReviewDto } from "../../api/study/dto/cardReviewDto";
import { ElementId } from "../../types/elements/elementId";
import { Rating } from "../../types/study/rating";
import { StudySessionLocationState } from "../../types/study/studySessionLocationState";
import { AppDispatch, RootState } from "../store";
import {
	cardGraded,
	cardRequeued,
	learningAssetAdvanced,
	learningAssetFinished,
	learningAssetSkipped,
	sessionAdvanced,
	sessionStarted,
	sessionStopped,
} from "./studyReducer";
import { selectStudyIndex } from "./studySelectors";
import { STUDY_SESSION_FINISHED } from "../../types/events/studySessionFinishedEvent";

// A same-day relearning card is re-queued rather than dropped until "later
// today" only if its new due time still falls within the live session.
const SESSION_HORIZON_MS = 2 * 60 * 1000;

export function startStudySession(navigate: NavigateFunction) {
	return async (dispatch: AppDispatch): Promise<boolean> => {
		const queue = await getDueElements();
		if (queue.length === 0) return false;
		dispatch(sessionStarted(queue));
		navigateToElement(queue[0]?.elementId, navigate);
		return true;
	};
}

export function gradeCardAction(
	cardId: string,
	scheduledReview: CardReviewDto,
	rating: Rating,
	navigate: NavigateFunction,
) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const shownAt = getState().study.shownAt;
		const durationMs = shownAt ? Date.now() - shownAt : null;
		const elementId: ElementId = { type: "card", id: cardId };
		const currentIndex = selectStudyIndex(getState());

		const review = await registerCardReview(
			scheduledReview,
			rating,
			durationMs,
		);
		dispatch(cardGraded());

		const dueInMs = new Date(review.due).getTime() - Date.now();
		const needsRequeue = dueInMs <= SESSION_HORIZON_MS;
		if (needsRequeue) {
			dispatch(cardRequeued({ elementId }));
		}

		advanceSession(
			dispatch,
			getState,
			navigate,
			needsRequeue ? null : elementId,
			currentIndex,
		);
	};
}

export function nextLearningAssetAction(
	elementId: ElementId,
	navigate: NavigateFunction,
) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const currentIndex = selectStudyIndex(getState());
		await nextLearningAsset(elementId);
		dispatch(learningAssetAdvanced({ elementType: elementId.type }));
		advanceSession(dispatch, getState, navigate, elementId, currentIndex);
	};
}

export function skipLearningAssetAction(
	elementId: ElementId,
	navigate: NavigateFunction,
) {
	return (dispatch: AppDispatch, getState: () => RootState) => {
		const currentIndex = selectStudyIndex(getState());
		dispatch(learningAssetSkipped({ elementId }));
		advanceSession(dispatch, getState, navigate, null, currentIndex);
	};
}

export function finishLearningAssetAction(
	elementId: ElementId,
	navigate: NavigateFunction,
) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const currentIndex = selectStudyIndex(getState());
		await finishLearningAsset(elementId);
		dispatch(learningAssetFinished({ elementType: elementId.type }));
		advanceSession(dispatch, getState, navigate, elementId, currentIndex);
	};
}

// Moves forward to whichever pending element now sits where the next one
// did — only wrapping back to the front of the queue once there's nothing
// left ahead, cycling through the remaining elements rather than ending
// the session while some are still unreviewed.
function advanceSession(
	dispatch: AppDispatch,
	getState: () => RootState,
	navigate: NavigateFunction,
	completedElementId: ElementId | null,
	currentIndex: number,
) {
	dispatch(sessionAdvanced({ completedElementId }));

	const { queue } = getState().study;
	if (queue.length === 0) {
		window.dispatchEvent(new Event(STUDY_SESSION_FINISHED));
		return;
	}

	const nextIndex = currentIndex >= queue.length ? 0 : currentIndex;
	navigateToElement(queue[nextIndex]?.elementId, navigate);
}

export function stopStudySessionAction() {
	return (dispatch: AppDispatch) => {
		dispatch(sessionStopped());
		window.dispatchEvent(new Event(STUDY_SESSION_FINISHED));
	};
}

function navigateToElement(
	element: ElementId | undefined,
	navigate: NavigateFunction,
) {
	if (!element) return;
	const state: StudySessionLocationState = { studySessionNav: true };
	void navigate(paths.element(element.type, element.id), { state });
}
