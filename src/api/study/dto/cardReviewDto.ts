import { CardState } from "../../../types/study/cardState";

export interface CardReviewDto {
	cardId: string;
	due: string;
	stability: number;
	difficulty: number;
	reps: number;
	lapses: number;
	state: CardState;
	lastReviewed: string | null;
	scheduledDays: number;
	learningSteps: number;
}
