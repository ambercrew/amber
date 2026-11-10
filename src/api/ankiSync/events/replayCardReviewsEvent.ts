import { FrontendRequestEvent } from "../../../hooks/useFrontendRequestBridge";
import { Rating } from "../../../types/study/rating";
import { CardReviewDto } from "../../study/dto/cardReviewDto";
import { StudyProfileDto } from "../../study/dto/studyProfileDto";

export const REPLAY_CARD_REVIEWS_EVENT = "replay-card-reviews";

export interface HistoryReviewDto {
	reviewedAt: string;
	rating: Rating;
}

export interface CardHistoryDto {
	cardId: string;
	profile: StudyProfileDto;
	/** The schedule `reviews` continue from; null replays them from a new card. */
	start: CardReviewDto | null;
	/** Oldest first. */
	reviews: HistoryReviewDto[];
}

/** Cards to reschedule from their reviews. */
interface ReplayCardReviewsEventDto extends FrontendRequestEvent {
	cards: CardHistoryDto[];
}

/** Each card's review state after its history, in order, or why it failed. */
export type ReplayCardReviewsResponseDto =
	{ reviews: CardReviewDto[] } | { error: string };

export default ReplayCardReviewsEventDto;
