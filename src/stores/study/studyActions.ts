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
import { AppDispatch, RootState } from "../store";
import { loadCurrentElementAction } from "../elements/elementsActions";
import {
	cardGraded,
	elementRequeued,
	elementsDropped,
	indexOfElement,
	learningAssetAdvanced,
	learningAssetFinished,
	learningAssetSkipped,
	newlyDueElementsAdded,
	sessionAdvanced,
	sessionElementShown,
	sessionLeft,
	sessionStarted,
	sessionStopped,
} from "./studyReducer";
import {
	selectStudyCurrentElement,
	selectStudyIndex,
	selectStudyScope,
	selectStudySessionElement,
} from "./studySelectors";
import { STUDY_SESSION_FINISHED } from "../../types/events/studySessionFinishedEvent";
import { REVIEW_NAVIGATION_STATE } from "../../types/study/reviewNavigationState";
import { isSameElement } from "../../utils/elementKey";
import errorToString from "../../utils/errorToString";

// A same-day relearning card is re-queued rather than dropped until "later
// today" only if its new due time still falls within the live session.
const SESSION_HORIZON_MS = 2 * 60 * 1000;

export function startStudySession(navigate: NavigateFunction) {
	return async (
		dispatch: AppDispatch,
		getState: () => RootState,
	): Promise<boolean> => {
		const queue = await getDueElements(selectStudyScope(getState()));
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
		const durationMs = elapsedSinceShown(getState());
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
		if (!before) {
			await dropVisitedElementIfNotDue(dispatch, getState);
			return;
		}

		const fit = await sessionFitOf(before.elementId);
		if (!fit || fit === "due") return;

		// The session may have moved on while the schedule was being read.
		const after = currentSessionElement(getState());
		if (!after || !isSameElement(after.elementId, before.elementId)) return;

		const needsRequeue = fit === "laterThisSession";
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

// A queued element visited while away leaves the session once it's rescheduled or
// finished there, so reaching it later can't overwrite that schedule.
async function dropVisitedElementIfNotDue(
	dispatch: AppDispatch,
	getState: () => RootState,
) {
	const visited = visitedQueuedElement(getState());
	if (!visited) return;

	// One due later this session keeps its place, as a requeued card does.
	const fit = await sessionFitOf(visited);
	if (fit !== "doneForToday") return;

	const still = visitedQueuedElement(getState());
	if (!still || !isSameElement(still, visited)) return;
	dispatch(
		elementsDropped({ elementIds: [visited], currentElementId: null }),
	);
	const { status, queue } = getState().study;
	if (status === "studying" && queue.length === 0)
		finishSession(dispatch, null);
}

type SessionFit = "due" | "laterThisSession" | "doneForToday";

// Where the element's current schedule puts it in the session; null when it has none or reading it failed.
async function sessionFitOf(elementId: ElementId): Promise<SessionFit | null> {
	let schedule;
	try {
		schedule = await currentSchedule(elementId);
	} catch (e) {
		// No component owns these listeners, so the failure is reported the
		// same way the sync thunk reports its own.
		// eslint-disable-next-line no-console
		console.error(e);
		notifications.show({ message: errorToString(e), color: "red" });
		return null;
	}
	if (!schedule) return null;
	if (schedule.finished) return "doneForToday";

	const dueInMs = new Date(schedule.due).getTime() - Date.now();
	if (dueInMs <= 0) return "due";
	return dueInMs <= SESSION_HORIZON_MS ? "laterThisSession" : "doneForToday";
}

// The open element when it's queued but the user is away from the one under review.
function visitedQueuedElement(state: RootState): ElementId | null {
	const { status, away, timedElementId } = state.study;
	if (status !== "studying" || !away) return null;
	const current = selectStudyCurrentElement(state);
	if (!current || (timedElementId && isSameElement(current, timedElementId)))
		return null;
	return current;
}

// Suspended elements leave the session for good; if the one under review is
// among them the session moves on as if it had been reviewed, even before it has loaded.
export function dropSuspendedElementsAction(
	elementIds: ElementId[],
	navigate: NavigateFunction,
) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const reviewed = elementUnderReview(getState());
		dispatch(
			elementsDropped({
				elementIds,
				currentElementId: reviewed?.elementId ?? null,
			}),
		);
		if (
			!reviewed ||
			!elementIds.some(id => isSameElement(id, reviewed.elementId))
		) {
			// A session the user is away from can lose its whole queue this way.
			const { status, queue } = getState().study;
			if (status === "studying" && queue.length === 0)
				finishSession(dispatch, null);
			return;
		}

		await advanceSession(
			dispatch,
			getState,
			navigate,
			reviewed.elementId,
			true,
			indexOfElement(getState().study.queue, reviewed.elementId),
		);
	};
}

// The queued element under review while the user isn't away, loaded or not.
function elementUnderReview(state: RootState): { elementId: ElementId } | null {
	const { status, away, timedElementId, queue } = state.study;
	if (status !== "studying" || away || !timedElementId) return null;
	return indexOfElement(queue, timedElementId) === -1
		? null
		: { elementId: timedElementId };
}

// Caps logged time so an element left open (or a clock change) can't record absurd study time.
const MAX_LOGGED_DURATION_MS = 60 * 60 * 1000;

// Time spent on the current session element, earlier visits and detours included, logged as study time.
function elapsedSinceShown(state: RootState): number | null {
	const shownAt = state.study.shownAt;
	if (!shownAt) return null;
	return Math.min(Math.max(Date.now() - shownAt, 0), MAX_LOGGED_DURATION_MS);
}

/** Pulls elements that became due mid-session (within the session's scope) into its queue. */
export function addNewlyDueElementsAction() {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		if (getState().study.status !== "studying") return;

		let due;
		try {
			due = await getDueElements(selectStudyScope(getState()));
		} catch (e) {
			// No component owns this listener, so it reports like applyScheduleChangeAction.
			// eslint-disable-next-line no-console
			console.error(e);
			notifications.show({ message: errorToString(e), color: "red" });
			return;
		}

		dispatch(
			newlyDueElementsAdded({
				due,
				currentIndex: selectStudyIndex(getState()),
			}),
		);
	};
}

// The session element being viewed; none while the user is away.
function currentSessionElement(
	state: RootState,
): { elementId: ElementId; index: number } | null {
	const elementId = selectStudySessionElement(state);
	return elementId ? { elementId, index: selectStudyIndex(state) } : null;
}

async function currentSchedule(
	elementId: ElementId,
): Promise<{ due: string; finished: boolean } | null> {
	if (elementId.type === "card") {
		const review = await getCardReview(elementId.id);
		return review ? { due: review.due, finished: false } : null;
	}

	const review = await getLearningAssetReview(elementId);
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
		await nextLearningAsset(elementId, elapsedSinceShown(getState()));
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
		await finishLearningAsset(elementId, elapsedSinceShown(getState()));
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
// `sessionAdvanced` is dispatched in the same tick as the next element is set
// as `elements.currentElement`, so they render together: either one alone
// would leave a render where the element on screen isn't the one under review.
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
		finishSession(dispatch, handledElementId);
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

	let advanced = false;
	const advance = () => {
		if (advanced) return;
		advanced = true;
		dispatch(
			sessionAdvanced({
				completedElementId: completed ? handledElementId : null,
				nextElementId: nextElement,
			}),
		);
	};
	await dispatch(loadCurrentElementAction(nextElement, advance));
	// The element couldn't be loaded, so the session still moves on.
	advance();

	void navigate(paths.element(nextElement.type, nextElement.id), {
		state: REVIEW_NAVIGATION_STATE,
	});
}

// Ends a session whose queue ran out, which shows its summary.
function finishSession(
	dispatch: AppDispatch,
	completedElementId: ElementId | null,
) {
	dispatch(sessionAdvanced({ completedElementId, nextElementId: null }));
	window.dispatchEvent(new Event(STUDY_SESSION_FINISHED));
}

function removeElement(
	queue: DueElementDto[],
	elementId: ElementId,
): DueElementDto[] {
	const index = indexOfElement(queue, elementId);
	if (index === -1) return queue;
	return [...queue.slice(0, index), ...queue.slice(index + 1)];
}

/** Comes back to the element under review, switches to one the queue chose, or visits. */
export function sessionRouteChangedAction(
	routeElement: ElementId | null,
	choosesReview: boolean,
) {
	return (dispatch: AppDispatch, getState: () => RootState) => {
		const { status, queue, timedElementId } = getState().study;
		if (status !== "studying") return;

		const queued =
			routeElement !== null && indexOfElement(queue, routeElement) !== -1;
		const underReview =
			routeElement !== null &&
			timedElementId !== null &&
			isSameElement(routeElement, timedElementId);
		if (queued && (underReview || choosesReview)) {
			dispatch(sessionElementShown({ elementId: routeElement }));
		} else {
			dispatch(sessionLeft());
		}
	};
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
	void navigate(paths.element(element.type, element.id), {
		state: REVIEW_NAVIGATION_STATE,
	});
}
