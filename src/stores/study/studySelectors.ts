import { RootState } from "../store";

export const selectStudyStatus = (state: RootState) => state.study.status;
export const selectStudyQueue = (state: RootState) => state.study.queue;
export const selectStudyTotalCount = (state: RootState) =>
	state.study.totalCount;

// The queue has no index of its own — "current" is whichever queue item
// matches the element actually being viewed, so it can never point at a
// stale position after navigating away (e.g. via the priority queue).
export const selectStudyIndex = (state: RootState) => {
	const currentElement = state.elements.currentElement;
	if (!currentElement) return -1;

	const { type, id } = currentElement.data.meta.elementId;
	return state.study.queue.findIndex(
		item => item.elementId.type === type && item.elementId.id === id,
	);
};

export const selectStudyCurrentElement = (state: RootState) =>
	state.study.queue[selectStudyIndex(state)]?.elementId ?? null;

export const selectStudyCardPhase = (state: RootState) => state.study.cardPhase;
export const selectStudyShownAt = (state: RootState) => state.study.shownAt;
export const selectStudyCounts = (state: RootState) => state.study.counts;
export const selectStudySummary = (state: RootState) => state.study.summary;
