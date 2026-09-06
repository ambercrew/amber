import { notifications } from "@mantine/notifications";
import { NavigateFunction } from "react-router";
import {
	registerCardReview,
	getCardReview,
	getDueElements,
	getLearningAssetReview,
	finishLearningAsset,
	nextLearningAsset,
} from "../../api/study/api/studyApi";
import { paths } from "../../paths";
import { CardReviewDto } from "../../api/study/dto/cardReviewDto";
import { DueElementDto } from "../../api/study/dto/dueElementDto";
import { ElementId } from "../../types/elements/elementId";
import { Rating } from "../../types/study/rating";
import { StudySessionLocationState } from "../../types/study/studySessionLocationState";
import { AppDispatch, RootState } from "../store";
import { loadCurrentElementAction } from "../elements/elementsActions";
import {
	cardGraded,
	elementRequeued,
	learningAssetAdvanced,
	learningAssetFinished,
	learningAssetSkipped,
	sessionAdvanced,
	sessionStarted,
	sessionStopped,
} from "./studyReducer";
import { selectStudyIndex } from "./studySelectors";
import { STUDY_SESSION_FINISHED } from "../../types/events/studySessionFinishedEvent";
import errorToString from "../../utils/errorToString";

// A same-day relearning card is re-queued rather than dropped until "later
// today" only if its new due time still falls within the live session.
const SESSION_HORIZON_MS = 2 * 60 * 1000;

export function startStudySession(navigate: NavigateFunction) {
	return async (dispatch: AppDispatch): Promise<boolean> => {
		const queue = await getDueElements();
		if (queue.length === 0) return false;
		dispatch(sessionStarted(queue));
		await navigateToElement(queue[0]?.elementId, navigate, dispatch);
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
			dispatch(elementRequeued({ elementId }));
		}

		await advanceSession(
			dispatch,
			getState,
			navigate,
			elementId,
			!needsRequeue,
			currentIndex,
		);
	};
}

// The backend announces every out-of-session schedule change (a due date set
// by hand, an element finished, repetitions reset) with a single payload-less
// event, so the session asks for the current element's own schedule before
// deciding. Nothing to do while it is still due — an unrelated bulk change
// elsewhere leaves it exactly as it was. Once it has been moved into the
// future (or finished) it leaves the session the same way reviewing it would:
// far enough out it's done for today, otherwise re-queued to come back later
// this session. Either way the session moves on, so the chosen due date isn't
// immediately overwritten by grading the very same element again.
//
// Only the element being viewed is reconciled: the event carries no payload,
// so a change to some other queued element (a bulk reschedule, say) can't be
// told apart from one that leaves the queue valid. Those elements keep their
// place until the session reaches them.
export function applyScheduleChangeAction(navigate: NavigateFunction) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const before = currentSessionElement(getState());
		if (!before) return;

		let schedule;
		try {
			schedule = await currentSchedule(before);
		} catch (e) {
			// No component owns this listener, so the failure is reported the
			// same way the sync thunk reports its own.
			// eslint-disable-next-line no-console
			console.error(e);
			notifications.show({ message: errorToString(e), color: "red" });
			return;
		}
		if (!schedule) return;

		// The session may have moved on while the schedule was being read.
		const after = currentSessionElement(getState());
		if (!after || !isSameElement(after.elementId, before.elementId)) return;

		const dueInMs = new Date(schedule.due).getTime() - Date.now();
		if (!schedule.finished && dueInMs <= 0) return;

		const needsRequeue =
			!schedule.finished && dueInMs <= SESSION_HORIZON_MS;
		if (needsRequeue) {
			dispatch(elementRequeued({ elementId: after.elementId }));
		}

		await advanceSession(
			dispatch,
			getState,
			navigate,
			after.elementId,
			!needsRequeue,
			after.index,
		);
	};
}

// The element the session is on, which is always the one being viewed.
function currentSessionElement(
	state: RootState,
): { elementId: ElementId; index: number } | null {
	if (state.study.status !== "studying") return null;

	const index = selectStudyIndex(state);
	const elementId = state.study.queue[index]?.elementId;
	return elementId ? { elementId, index } : null;
}

async function currentSchedule(current: {
	elementId: ElementId;
}): Promise<{ due: string; finished: boolean } | null> {
	if (current.elementId.type === "card") {
		const review = await getCardReview(current.elementId.id);
		return review ? { due: review.due, finished: false } : null;
	}

	const review = await getLearningAssetReview(current.elementId);
	return review
		? { due: review.due, finished: review.finishedAt !== null }
		: null;
}

export function nextLearningAssetAction(
	elementId: ElementId,
	navigate: NavigateFunction,
) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const currentIndex = selectStudyIndex(getState());
		await nextLearningAsset(elementId);
		dispatch(learningAssetAdvanced({ elementType: elementId.type }));
		await advanceSession(
			dispatch,
			getState,
			navigate,
			elementId,
			true,
			currentIndex,
		);
	};
}

export function skipLearningAssetAction(
	elementId: ElementId,
	navigate: NavigateFunction,
) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const currentIndex = selectStudyIndex(getState());
		dispatch(learningAssetSkipped({ elementId }));
		await advanceSession(
			dispatch,
			getState,
			navigate,
			elementId,
			false,
			currentIndex,
		);
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
		await advanceSession(
			dispatch,
			getState,
			navigate,
			elementId,
			true,
			currentIndex,
		);
	};
}

// Moves forward to whichever pending element now sits where the next one
// did — only wrapping back to the front of the queue once there's nothing
// left ahead, cycling through the remaining elements rather than ending
// the session while some are still unreviewed.
//
// The completed element isn't removed from the queue until *after* the next
// element's content has loaded into `elements.currentElement`. Dropping it
// first (as `sessionAdvanced` does) and only then loading the next element
// would leave a render — however brief — where the queue no longer contains
// a match for `currentElement`, which is exactly the flash this avoids:
// `selectStudyCurrentElement` has nothing to resolve to until the fetch
// finishes. The target element is still present in the pre-removal queue,
// so loading it first means every render in between stays consistent.
async function advanceSession(
	dispatch: AppDispatch,
	getState: () => RootState,
	navigate: NavigateFunction,
	handledElementId: ElementId,
	completed: boolean,
	currentIndex: number,
) {
	const queueBeforeCompletion = getState().study.queue;
	const queueAfterCompletion = completed
		? removeElement(queueBeforeCompletion, handledElementId)
		: queueBeforeCompletion;

	if (queueAfterCompletion.length === 0) {
		dispatch(sessionAdvanced({ completedElementId: handledElementId }));
		window.dispatchEvent(new Event(STUDY_SESSION_FINISHED));
		return;
	}

	let nextIndex =
		currentIndex >= queueAfterCompletion.length ? 0 : currentIndex;

	// An element that was only re-queued or skipped stays in the queue, and
	// when it sat at the very end there is no slot further back to move it
	// to — it keeps the slot the session is about to show. Wrap around
	// instead, so the session moves on to the elements ahead of it rather
	// than presenting the same one again.
	if (
		queueAfterCompletion.length > 1 &&
		isSameElement(
			queueAfterCompletion[nextIndex].elementId,
			handledElementId,
		)
	) {
		nextIndex = nextIndex === 0 ? 1 : 0;
	}

	const nextElement = queueAfterCompletion[nextIndex].elementId;

	await dispatch(loadCurrentElementAction(nextElement));

	dispatch(
		sessionAdvanced({
			completedElementId: completed ? handledElementId : null,
		}),
	);

	const state: StudySessionLocationState = { studySessionNav: true };
	void navigate(paths.element(nextElement.type, nextElement.id), { state });
}

function removeElement(
	queue: DueElementDto[],
	elementId: ElementId,
): DueElementDto[] {
	const index = queue.findIndex(item =>
		isSameElement(item.elementId, elementId),
	);
	if (index === -1) return queue;
	return [...queue.slice(0, index), ...queue.slice(index + 1)];
}

function isSameElement(a: ElementId, b: ElementId): boolean {
	return a.type === b.type && a.id === b.id;
}

export function stopStudySessionAction() {
	return (dispatch: AppDispatch) => {
		dispatch(sessionStopped());
		window.dispatchEvent(new Event(STUDY_SESSION_FINISHED));
	};
}

async function navigateToElement(
	element: ElementId | undefined,
	navigate: NavigateFunction,
	dispatch: AppDispatch,
) {
	if (!element) return;
	await dispatch(loadCurrentElementAction(element));
	const state: StudySessionLocationState = { studySessionNav: true };
	void navigate(paths.element(element.type, element.id), { state });
}
