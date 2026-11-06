import { createSlice, original, PayloadAction } from "@reduxjs/toolkit";
import { DueElementDto } from "../../api/study/dto/dueElementDto";
import { StudyScopeDto } from "../../api/study/dto/studyScopeDto";
import { ElementId } from "../../types/elements/elementId";
import { ElementNodeType } from "../../types/elements/elementNodeType";
import { elementKey, isSameElement } from "../../utils/elementKey";
import { loadStudyScope } from "./studyScopeStorage";

export type StudyStatus = "editing" | "studying";
export type CardPhase = "question" | "answer";

export interface StudyCounts {
	cards: number;
	learningAssets: number;
	extracts: number;
	finished: number;
}

export interface StudyState {
	status: StudyStatus;
	queue: DueElementDto[];
	// Every element the session has queued — the denominator for "done so far /
	// total"; it only shrinks when a pending element is suspended.
	totalCount: number;
	cardPhase: CardPhase;
	shownAt: number | null;
	counts: StudyCounts;
	summary: StudyCounts | null;
	studyScope: StudyScopeDto | null;
}

// How far into the session (in queue slots) an Again-rated card is
// re-inserted so the session can still drain it to done today.
const SESSION_REQUEUE_OFFSET = 8;

const initialState: StudyState = {
	status: "editing",
	queue: [],
	totalCount: 0,
	cardPhase: "question",
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	summary: null,
	studyScope: loadStudyScope(),
};

/** The queue before this reducer ran: array methods on a draft proxy each item they touch, too slow for a long queue. */
function plainQueue(state: StudyState) {
	return original(state)?.queue ?? state.queue;
}

export function indexOfElement(queue: DueElementDto[], elementId: ElementId) {
	return queue.findIndex(item => isSameElement(item.elementId, elementId));
}

const studySlice = createSlice({
	name: "study",
	initialState,
	reducers: {
		sessionStarted: (state, action: PayloadAction<DueElementDto[]>) => {
			state.status = "studying";
			state.queue = action.payload;
			state.totalCount = action.payload.length;
			state.cardPhase = "question";
			state.shownAt = Date.now();
			state.counts = {
				cards: 0,
				learningAssets: 0,
				extracts: 0,
				finished: 0,
			};
			state.summary = null;
		},
		answerShown: state => {
			state.cardPhase = "answer";
		},
		cardGraded: state => {
			state.counts.cards += 1;
		},
		// Repositions an element that still needs revisiting later this
		// session, rather than removing it from the pending queue.
		elementRequeued: (
			state,
			action: PayloadAction<{ elementId: ElementId }>,
		) => {
			const queue = [...plainQueue(state)];
			const currentIndex = indexOfElement(
				queue,
				action.payload.elementId,
			);
			if (currentIndex === -1) return;
			const current = queue[currentIndex];
			const insertAt = Math.min(
				currentIndex + SESSION_REQUEUE_OFFSET,
				queue.length,
			);
			queue.splice(currentIndex, 1);
			queue.splice(insertAt - 1, 0, current);
			state.queue = queue;
		},
		// Adds elements that became due mid-session (e.g. a due date set in the
		// aside), keeping `due`'s priority order but never before the current one.
		newlyDueElementsAdded: (
			state,
			action: PayloadAction<{
				due: DueElementDto[];
				currentIndex: number;
			}>,
		) => {
			if (state.status !== "studying") return;
			const { due, currentIndex } = action.payload;
			const queued = new Set(
				plainQueue(state).map(item => elementKey(item.elementId)),
			);
			const queue = [...plainQueue(state)];
			// Walking backwards, each new element lands before the next queued one.
			let anchor = queue.length;
			// Only found once a new element needs it, as nearly all of `due` is already queued.
			let nextQueued: ElementId | null = null;
			for (let i = due.length - 1; i >= 0; i--) {
				const item = due[i];
				if (queued.has(elementKey(item.elementId))) {
					nextQueued = item.elementId;
					continue;
				}
				if (nextQueued) anchor = indexOfElement(queue, nextQueued);
				nextQueued = null;
				anchor = Math.max(anchor, currentIndex + 1);
				queue.splice(anchor, 0, item);
				queued.add(elementKey(item.elementId));
				state.totalCount += 1;
			}
			if (queue.length !== plainQueue(state).length) state.queue = queue;
		},
		// Takes pending suspended elements out of the session and its total. The
		// current one stays and counts as done, so `advanceSession` moves off it without a flash.
		elementsDropped: (
			state,
			action: PayloadAction<{
				elementIds: ElementId[];
				currentElementId: ElementId | null;
			}>,
		) => {
			const { elementIds, currentElementId } = action.payload;
			const dropped = new Set(elementIds.map(elementKey));
			if (currentElementId) dropped.delete(elementKey(currentElementId));
			const queue = plainQueue(state);
			const remaining = queue.filter(
				item => !dropped.has(elementKey(item.elementId)),
			);
			state.totalCount -= queue.length - remaining.length;
			state.queue = remaining;
		},
		learningAssetAdvanced: (
			state,
			action: PayloadAction<{ elementType: ElementNodeType }>,
		) => {
			if (action.payload.elementType === "extract") {
				state.counts.extracts += 1;
			} else {
				state.counts.learningAssets += 1;
			}
		},
		// Moves a learning asset/extract to the end of the queue when the user
		// isn't ready to review it yet, without marking it done.
		learningAssetSkipped: (
			state,
			action: PayloadAction<{ elementId: ElementId }>,
		) => {
			const queue = [...plainQueue(state)];
			const currentIndex = indexOfElement(
				queue,
				action.payload.elementId,
			);
			if (currentIndex === -1) return;
			const [current] = queue.splice(currentIndex, 1);
			queue.push(current);
			state.queue = queue;
		},
		learningAssetFinished: (
			state,
			action: PayloadAction<{ elementType: ElementNodeType }>,
		) => {
			if (action.payload.elementType === "extract") {
				state.counts.extracts += 1;
			} else {
				state.counts.learningAssets += 1;
			}
			state.counts.finished += 1;
		},
		// Removes the reviewed element (if any — a requeued card isn't done
		// yet, so it isn't passed here) and moves on to whichever pending
		// element is now at the front of the queue, regardless of where the
		// just-reviewed element used to sit.
		sessionAdvanced: (
			state,
			action: PayloadAction<{ completedElementId: ElementId | null }>,
		) => {
			const { completedElementId } = action.payload;
			if (completedElementId) {
				const queue = plainQueue(state);
				const index = indexOfElement(queue, completedElementId);
				if (index !== -1)
					state.queue = [
						...queue.slice(0, index),
						...queue.slice(index + 1),
					];
			}

			if (state.queue.length === 0) {
				state.summary = { ...state.counts };
				resetSession(state);
			} else {
				state.cardPhase = "question";
				state.shownAt = Date.now();
			}
		},
		// Keeps the remaining queue (still due) so the sidebar preview doesn't
		// blank out before its refresh replaces it.
		sessionStopped: state => {
			const { queue } = state;
			resetSession(state);
			state.queue = queue;
		},
		summaryDismissed: state => {
			state.summary = null;
		},
		// Lets the sidebar preview due elements before a session starts,
		// without affecting status/counts/etc.
		queueLoaded: (state, action: PayloadAction<DueElementDto[]>) => {
			state.queue = action.payload;
		},
		// Restarts the shown-answer/timer state whenever the displayed
		// element changes for any reason (session advance, or an
		// out-of-order jump via the priority queue), so the footer timer
		// and the review-duration measurement never carry over from a
		// previously viewed element.
		studyScopeChanged: (
			state,
			action: PayloadAction<StudyScopeDto | null>,
		) => {
			state.studyScope = action.payload;
		},
		elementShown: state => {
			state.cardPhase = "question";
			state.shownAt = Date.now();
		},
	},
});

function resetSession(state: StudyState) {
	state.status = "editing";
	state.queue = [];
	state.totalCount = 0;
	state.cardPhase = "question";
	state.shownAt = null;
}

export default studySlice.reducer;

export const {
	sessionStarted,
	answerShown,
	cardGraded,
	elementRequeued,
	newlyDueElementsAdded,
	elementsDropped,
	learningAssetAdvanced,
	learningAssetFinished,
	learningAssetSkipped,
	sessionAdvanced,
	sessionStopped,
	summaryDismissed,
	queueLoaded,
	elementShown,
	studyScopeChanged,
} = studySlice.actions;
