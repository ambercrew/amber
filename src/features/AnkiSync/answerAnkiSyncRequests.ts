import ReplayCardReviewsEventDto, {
	ReplayCardReviewsResponseDto,
} from "../../api/ankiSync/events/replayCardReviewsEvent";
import { replayReviews } from "../Study/utils/cardScheduling";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Answers the backend's request to reschedule cards from their merged Amber and Anki reviews. */
export function replayCardReviews({
	cards,
}: ReplayCardReviewsEventDto): ReplayCardReviewsResponseDto {
	try {
		return {
			reviews: cards.map(card =>
				replayReviews(
					card.profile,
					card.cardId,
					card.reviews,
					card.start,
				),
			),
		};
	} catch (error) {
		return { error: errorMessage(error) };
	}
}
