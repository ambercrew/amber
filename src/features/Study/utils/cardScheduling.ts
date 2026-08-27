import {
	FSRS,
	generatorParameters,
	Rating as FsrsRating,
	State as FsrsState,
	type Card as FsrsCard,
	type Grade,
	type Steps,
} from "ts-fsrs";
import { CardReviewDto } from "../../../api/study/dto/cardReviewDto";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import { CardState } from "../../../types/study/cardState";
import { Rating } from "../../../types/study/rating";

// Cards are scheduled here rather than in the backend because ts-fsrs
// implements the whole FSRS scheduler — the New/Learning/Review/Relearning
// state machine, the learning and relearning steps, whole-day rounding and the
// maximum-interval cap — while the Rust `fsrs` crate only exposes the memory
// model and leaves that wrapper to its caller.

const GRADES: Record<Rating, Grade> = {
	again: FsrsRating.Again,
	hard: FsrsRating.Hard,
	good: FsrsRating.Good,
	easy: FsrsRating.Easy,
};

const FSRS_STATES: Record<CardState, FsrsState> = {
	new: FsrsState.New,
	learning: FsrsState.Learning,
	review: FsrsState.Review,
	relearning: FsrsState.Relearning,
};

const CARD_STATES: Record<FsrsState, CardState> = {
	[FsrsState.New]: "new",
	[FsrsState.Learning]: "learning",
	[FsrsState.Review]: "review",
	[FsrsState.Relearning]: "relearning",
};

export function createScheduler(profile: StudyProfileDto): FSRS {
	return new FSRS(
		generatorParameters({
			w: profile.fsrsParams.length > 0 ? profile.fsrsParams : undefined,
			request_retention: profile.desiredRetention,
			learning_steps:
				profile.learningSteps.length > 0
					? (profile.learningSteps as Steps)
					: undefined,
			relearning_steps:
				profile.relearningSteps.length > 0
					? (profile.relearningSteps as Steps)
					: undefined,
		}),
	);
}

// ts-fsrs derives the days elapsed from `last_review` and overwrites whatever
// the input card carried, so its deprecated `elapsed_days` field is left off
// the card we build. The type still requires it, hence the cast where the
// scheduler is called.
type SchedulerCard = Omit<FsrsCard, "elapsed_days">;

function toFsrsCard(review: CardReviewDto): SchedulerCard {
	return {
		due: new Date(review.due),
		stability: review.stability,
		difficulty: review.difficulty,
		scheduled_days: review.scheduledDays,
		learning_steps: review.learningSteps,
		reps: review.reps,
		lapses: review.lapses,
		state: FSRS_STATES[review.state],
		last_review: review.lastReviewed
			? new Date(review.lastReviewed)
			: undefined,
	};
}

function toCardReview(cardId: string, card: FsrsCard): CardReviewDto {
	return {
		cardId,
		due: card.due.toISOString(),
		stability: card.stability,
		difficulty: card.difficulty,
		reps: card.reps,
		lapses: card.lapses,
		state: CARD_STATES[card.state],
		lastReviewed: card.last_review ? card.last_review.toISOString() : null,
		scheduledDays: card.scheduled_days,
		learningSteps: card.learning_steps,
	};
}

/**
 * The review each rating would produce for `review` if it were graded at
 * `now`, so the due dates previewed on the grade buttons and the review that
 * actually gets saved come from one computation.
 */
export function scheduleAllRatings(
	profile: StudyProfileDto,
	review: CardReviewDto,
	now: Date,
): Record<Rating, CardReviewDto> {
	const preview = createScheduler(profile).repeat(
		toFsrsCard(review) as FsrsCard,
		now,
	);
	const scheduled = (rating: Rating) =>
		toCardReview(review.cardId, preview[GRADES[rating]].card);

	return {
		again: scheduled("again"),
		hard: scheduled("hard"),
		good: scheduled("good"),
		easy: scheduled("easy"),
	};
}
