import ReplayCardReviewsEventDto, {
	ReplayCardReviewsResponseDto,
} from "../../api/ankiSync/events/replayCardReviewsEvent";
import { createScheduler, replayReviews } from "../Study/utils/cardScheduling";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Answers the backend's request to reschedule cards from their merged Amber and Anki reviews. */
export async function replayCardReviews({
	cards,
}: ReplayCardReviewsEventDto): Promise<ReplayCardReviewsResponseDto> {
	try {
		const reviews = await Promise.all(
			cards.map(async card =>
				replayReviews(
					await createScheduler(card.profile),
					card.cardId,
					card.reviews,
					card.start,
				),
			),
		);
		return { reviews };
	} catch (error) {
		return { error: errorMessage(error) };
	}
}
