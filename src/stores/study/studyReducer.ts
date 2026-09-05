import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { DueElementDto } from "../../api/study/dto/dueElementDto";
import { ElementId } from "../../types/elements/elementId";
import { ElementNodeType } from "../../types/elements/elementNodeType";

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
	// The queue's length at session start — unlike queue.length, this never
	// shrinks (elements are only ever removed from queue, never added), so
	// it's the stable denominator for a "done so far / total" progress
	// display.
	totalCount: number;
	cardPhase: CardPhase;
	shownAt: number | null;
	counts: StudyCounts;
	summary: StudyCounts | null;
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
};

function isSameElement(a: ElementId, b: ElementId): boolean {
	return a.type === b.type && a.id === b.id;
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
			const currentIndex = state.queue.findIndex(item =>
				isSameElement(item.elementId, action.payload.elementId),
			);
			if (currentIndex === -1) return;
			const current = state.queue[currentIndex];
			const insertAt = Math.min(
				currentIndex + SESSION_REQUEUE_OFFSET,
				state.queue.length,
			);
			state.queue.splice(currentIndex, 1);
			state.queue.splice(insertAt - 1, 0, current);
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
			const currentIndex = state.queue.findIndex(item =>
				isSameElement(item.elementId, action.payload.elementId),
			);
			if (currentIndex === -1) return;
			const [current] = state.queue.splice(currentIndex, 1);
			state.queue.push(current);
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
				const index = state.queue.findIndex(item =>
					isSameElement(item.elementId, completedElementId),
				);
				if (index !== -1) state.queue.splice(index, 1);
			}

			if (state.queue.length === 0) {
				state.summary = { ...state.counts };
				resetSession(state);
			} else {
				state.cardPhase = "question";
				state.shownAt = Date.now();
			}
		},
		sessionStopped: resetSession,
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
	learningAssetAdvanced,
	learningAssetFinished,
	learningAssetSkipped,
	sessionAdvanced,
	sessionStopped,
	summaryDismissed,
	queueLoaded,
	elementShown,
} = studySlice.actions;
