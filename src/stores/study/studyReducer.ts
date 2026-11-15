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

// `endedEarly`: the user ended the session before its queue ran out.
export type SessionSummary = StudyCounts & {
	endedEarly: boolean;
	durationMs: number;
};

export interface StudyState {
	status: StudyStatus;
	queue: DueElementDto[];
	// Every element the session has queued — the denominator for "done so far /
	// total"; it only shrinks when a pending element is suspended.
	totalCount: number;
	cardPhase: CardPhase;
	// When the timed element's clock started, backdated by its earlier visits.
	shownAt: number | null;
	// The element the clock runs for: the session element shown last, even while away.
	timedElementId: ElementId | null;
	// Time already spent on elements left before their review, by `elementKey`.
	timeSpent: Record<string, number>;
	counts: StudyCounts;
	summary: SessionSummary | null;
	studyScope: StudyScopeDto | null;
	// The user is away from the session's elements; the clock keeps running.
	away: boolean;
	// When the session started, for the summary's total time.
	startedAt: number | null;
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
	timedElementId: null,
	timeSpent: {},
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	summary: null,
	studyScope: loadStudyScope(),
	away: false,
	startedAt: null,
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
			state.timedElementId = action.payload[0]?.elementId ?? null;
			state.timeSpent = {};
			state.counts = {
				cards: 0,
				learningAssets: 0,
				extracts: 0,
				finished: 0,
			};
			state.summary = null;
			state.away = false;
			state.startedAt = Date.now();
		},
		answerShown: state => {
			state.cardPhase = "answer";
		},
		cardGraded: state => {
			state.counts.cards += 1;
			restartClock(state);
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
			for (const key of dropped) delete state.timeSpent[key];
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
			restartClock(state);
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
			restartClock(state);
		},
		// Removes the reviewed element (if any — a requeued card isn't done
		// yet, so it isn't passed here) and moves on to whichever pending
		// element is now at the front of the queue, regardless of where the
		// just-reviewed element used to sit.
		sessionAdvanced: (
			state,
			action: PayloadAction<{
				completedElementId: ElementId | null;
				nextElementId: ElementId | null;
			}>,
		) => {
			const { completedElementId, nextElementId } = action.payload;
			let queue = plainQueue(state);
			if (completedElementId) {
				const index = indexOfElement(queue, completedElementId);
				if (index !== -1) {
					queue = [
						...queue.slice(0, index),
						...queue.slice(index + 1),
					];
					state.queue = queue;
				}
			}

			if (queue.length === 0 || !nextElementId) {
				state.summary = summarize(state, false);
				resetSession(state);
				return;
			}
			switchClock(state, nextElementId, queue);
			// Its review logged its time, so none of it is kept.
			if (completedElementId)
				delete state.timeSpent[elementKey(completedElementId)];
			state.cardPhase = "question";
		},
		// Keeps the remaining queue (still due) so the sidebar preview doesn't
		// blank out before its refresh replaces it.
		sessionStopped: state => {
			const { queue, counts } = state;
			if (counts.cards + counts.learningAssets + counts.extracts > 0)
				state.summary = summarize(state, true);
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
		studyScopeChanged: (
			state,
			action: PayloadAction<StudyScopeDto | null>,
		) => {
			state.studyScope = action.payload;
		},
		// The user left the session's elements for one outside it, or another page.
		sessionLeft: state => {
			if (state.status !== "studying" || !state.timedElementId) return;
			state.away = true;
		},
		// A session element is on screen. Returning to the timed one keeps its
		// answer; another resumes its own clock and asks its question afresh.
		sessionElementShown: (
			state,
			action: PayloadAction<{ elementId: ElementId }>,
		) => {
			if (state.status !== "studying") return;
			state.away = false;
			const { elementId } = action.payload;
			if (
				state.timedElementId &&
				isSameElement(state.timedElementId, elementId)
			)
				return;
			switchClock(state, elementId, plainQueue(state));
			state.cardPhase = "question";
		},
	},
});

// A review just logged the time so far, so later time counts towards the next one.
function restartClock(state: StudyState) {
	state.shownAt = Date.now();
}

// Banks the timed element's time (unless it has left `queue`) and resumes `next`'s from its earlier visits.
function switchClock(
	state: StudyState,
	next: ElementId,
	queue: DueElementDto[],
) {
	const now = Date.now();
	const left = state.timedElementId;
	if (left && state.shownAt !== null && indexOfElement(queue, left) !== -1) {
		const key = elementKey(left);
		state.timeSpent[key] = Math.max(now - state.shownAt, 0);
	}
	const nextKey = elementKey(next);
	state.shownAt = now - (state.timeSpent[nextKey] ?? 0);
	delete state.timeSpent[nextKey];
	state.timedElementId = next;
}

function summarize(state: StudyState, endedEarly: boolean): SessionSummary {
	const durationMs =
		state.startedAt === null
			? 0
			: Math.max(Date.now() - state.startedAt, 0);
	return { ...state.counts, endedEarly, durationMs };
}

function resetSession(state: StudyState) {
	state.status = "editing";
	state.queue = [];
	state.totalCount = 0;
	state.cardPhase = "question";
	state.shownAt = null;
	state.timedElementId = null;
	state.timeSpent = {};
	state.away = false;
	state.startedAt = null;
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
	sessionLeft,
	sessionElementShown,
	studyScopeChanged,
} = studySlice.actions;
