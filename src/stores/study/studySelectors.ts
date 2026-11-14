import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { elementKey, isSameElement } from "../../utils/elementKey";

export const selectStudyStatus = (state: RootState) => state.study.status;
export const selectStudyQueue = (state: RootState) => state.study.queue;
export const selectStudyTotalCount = (state: RootState) =>
	state.study.totalCount;
export const selectStudyScope = (state: RootState) => state.study.studyScope;

// The queue has no index of its own — "current" is whichever queue item
// matches the element actually being viewed, so it can never point at a
// stale position after navigating away (e.g. via the priority queue).
export const selectStudyIndex = createSelector(
	[
		selectStudyQueue,
		(state: RootState) =>
			state.elements.currentElement?.data.meta.elementId,
	],
	(queue, elementId) => {
		if (!elementId) return -1;
		const { type, id } = elementId;
		return queue.findIndex(
			item => item.elementId.type === type && item.elementId.id === id,
		);
	},
);

export const selectStudyCurrentElement = (state: RootState) =>
	state.study.queue[selectStudyIndex(state)]?.elementId ?? null;

export const selectStudyAway = (state: RootState) => state.study.away;

/** The element under review once it's loaded on screen: none outside a session, while away or still loading. */
export const selectStudySessionElement = (state: RootState) => {
	const { status, away, timedElementId } = state.study;
	if (status !== "studying" || away || !timedElementId) return null;
	const current = selectStudyCurrentElement(state);
	return current && isSameElement(current, timedElementId)
		? timedElementId
		: null;
};

/** The element under review, which the priority queue marks: none outside a session. */
export const selectStudyReviewedElement = (state: RootState) =>
	state.study.status === "studying" ? state.study.timedElementId : null;

/** Where returning to the session leads: the element left, or the queue's front once that's gone. */
export const selectStudyReturnItem = createSelector(
	[
		selectStudyAway,
		selectStudyQueue,
		(state: RootState) => state.study.timedElementId,
	],
	(away, queue, timedElementId) => {
		if (!away) return null;
		const left = timedElementId
			? queue.find(item => isSameElement(item.elementId, timedElementId))
			: undefined;
		return left ?? queue[0] ?? null;
	},
);

/** Keys (`elementKey`) of the queued elements, for membership checks that don't walk the queue. */
export const selectStudyQueuedKeys = createSelector(
	[selectStudyQueue],
	queue => new Set(queue.map(item => elementKey(item.elementId))),
);

export const selectStudyCardPhase = (state: RootState) => state.study.cardPhase;
export const selectStudyShownAt = (state: RootState) => state.study.shownAt;
export const selectStudyCounts = (state: RootState) => state.study.counts;
export const selectStudySummary = (state: RootState) => state.study.summary;
