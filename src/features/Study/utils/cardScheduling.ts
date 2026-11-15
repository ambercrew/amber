import {
	DefaultScheduler,
	Rating as FsrsRating,
	State as FsrsState,
	type DefaultSchedulerCard,
	type DefaultSchedulerCardInput,
	type Grade,
	type ScheduleStatus,
	type StepUnit,
} from "ts-fsrs";
import { CardReviewDto } from "../../../api/study/dto/cardReviewDto";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import { CardState } from "../../../types/study/cardState";
import { Rating } from "../../../types/study/rating";
import { startOfLocalDay } from "../../../utils/startOfLocalDay";

// Cards are scheduled here rather than in the backend because ts-fsrs
// implements the whole FSRS scheduler — the New/Learning/Review/Relearning
// state machine, the learning and relearning steps, whole-day rounding and the
// maximum-interval cap — while the Rust `fsrs` crate only exposes the memory
// model and leaves that wrapper to its caller.

// FSRS-6 matches the weights the Rust `fsrs` crate optimizes and the stored memory states.
export type CardScheduler = DefaultScheduler<"FSRS-6">;
type FsrsCard = DefaultSchedulerCard<"FSRS-6">;
type FsrsCardInput = DefaultSchedulerCardInput<"FSRS-6">;
type FsrsStateValue = (typeof FsrsState)[keyof typeof FsrsState];

const GRADES: Record<Rating, Grade> = {
	again: FsrsRating.Again,
	hard: FsrsRating.Hard,
	good: FsrsRating.Good,
	easy: FsrsRating.Easy,
};

const FSRS_STATES: Record<CardState, FsrsStateValue> = {
	new: FsrsState.New,
	learning: FsrsState.Learning,
	review: FsrsState.Review,
	relearning: FsrsState.Relearning,
};

const CARD_STATES: Record<FsrsStateValue, CardState> = {
	[FsrsState.New]: "new",
	[FsrsState.Learning]: "learning",
	[FsrsState.Review]: "review",
	[FsrsState.Relearning]: "relearning",
};

// ts-fsrs counts relearning as learning in its schedule status.
const SCHEDULE_STATUSES: Record<CardState, ScheduleStatus> = {
	new: "new",
	learning: "learning",
	review: "review",
	relearning: "learning",
};

export function createScheduler(
	profile: StudyProfileDto,
): Promise<CardScheduler> {
	return DefaultScheduler({
		version: "FSRS-6",
		weights: profile.fsrsParams.length > 0 ? profile.fsrsParams : undefined,
		desiredRetention: profile.desiredRetention,
		// An empty list means no steps, not ts-fsrs's defaults.
		learningSteps: profile.learningSteps as StepUnit[],
		relearningSteps: profile.relearningSteps as StepUnit[],
	});
}

function toFsrsCard(review: CardReviewDto): FsrsCardInput {
	return {
		cardId: review.cardId,
		dueAt: new Date(review.due),
		stability: review.stability,
		difficulty: review.difficulty,
		scheduledDays: review.scheduledDays,
		learningStep: review.learningSteps,
		reps: review.reps,
		lapses: review.lapses,
		state: FSRS_STATES[review.state],
		scheduleStatus: SCHEDULE_STATUSES[review.state],
		lastReviewAt: review.lastReviewed
			? new Date(review.lastReviewed)
			: null,
	};
}

// A card scheduled days ahead is due from the start of its day, as in Anki, so both apps show it all day.
function dueDate(card: FsrsCard): Date {
	return card.scheduledDays >= 1 ? startOfLocalDay(card.dueAt) : card.dueAt;
}

function toCardReview(cardId: string, card: FsrsCard): CardReviewDto {
	return {
		cardId,
		due: dueDate(card).toISOString(),
		stability: card.stability,
		difficulty: card.difficulty,
		reps: card.reps,
		lapses: card.lapses,
		state: CARD_STATES[card.state],
		lastReviewed: card.lastReviewAt
			? card.lastReviewAt.toISOString()
			: null,
		scheduledDays: card.scheduledDays,
		learningSteps: card.learningStep,
	};
}

/**
 * The review each rating would produce for `review` if it were graded at
 * `now`, so the due dates previewed on the grade buttons and the review that
 * actually gets saved come from one computation.
 */
export function scheduleAllRatings(
	scheduler: CardScheduler,
	review: CardReviewDto,
	now: Date,
): Record<Rating, CardReviewDto> {
	const card = toFsrsCard(review);
	const scheduled = (rating: Rating) =>
		toCardReview(
			review.cardId,
			scheduler.review({ card, now, grade: GRADES[rating] }).card,
		);

	return {
		again: scheduled("again"),
		hard: scheduled("hard"),
		good: scheduled("good"),
		easy: scheduled("easy"),
	};
}

/**
 * A card's review state after replaying `reviews` (oldest first) from `start`,
 * or from a new card without one, e.g. once reviews made in Anki arrive.
 */
export function replayReviews(
	scheduler: CardScheduler,
	cardId: string,
	reviews: { reviewedAt: string; rating: Rating }[],
	start: CardReviewDto | null = null,
): CardReviewDto {
	let card: FsrsCardInput = start
		? toFsrsCard(start)
		: scheduler.newCard({
				cardId,
				now: new Date(reviews[0]?.reviewedAt ?? Date.now()),
			});
	for (const review of reviews) {
		card = scheduler.review({
			card,
			now: new Date(review.reviewedAt),
			grade: GRADES[review.rating],
		}).card;
	}
	return toCardReview(cardId, card as FsrsCard);
}
