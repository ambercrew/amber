import ReplayCardReviewsEventDto, {
	REPLAY_CARD_REVIEWS_EVENT,
} from "../../../api/ankiSync/events/replayCardReviewsEvent";
import { useFrontendRequestBridge } from "../../../hooks/useFrontendRequestBridge";
import { replayCardReviews } from "../answerAnkiSyncRequests";

/** Answers the backend's Anki sync requests: rescheduling cards from their merged reviews. */
export function useAnkiSyncBridge() {
	useFrontendRequestBridge<ReplayCardReviewsEventDto>(
		REPLAY_CARD_REVIEWS_EVENT,
		async event => JSON.stringify(await replayCardReviews(event)),
	);
}
