/** Location state of a navigation that chooses the element under review: the queue's own moves. */
export interface ReviewNavigationState {
	choosesReview?: boolean;
}

export const REVIEW_NAVIGATION_STATE: ReviewNavigationState = {
	choosesReview: true,
};
